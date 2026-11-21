import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { getSettings, nextNumber, logAudit, round2, recordMovement } from "@/lib/server/core";

/** مرتجع مرتبط بالفاتورة الأصلية — استعادة المخزون وعكس النقاط */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "ACCOUNTANT"]);
    const settings = await getSettings();
    const { id: originalId } = await params;
    const body = await req.json();
    const { items, reason, notes } = body ?? {};
    if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "حدد الأصناف المراد إرجاعها");

    const original = await db.invoice.findUnique({
      where: { id: originalId },
      include: { items: true, customer: true },
    });
    if (!original) throw new ApiError(404, "الفاتورة الأصلية غير موجودة");
    if (original.type !== "SALE") throw new ApiError(400, "المرتجع يعتمد على فاتورة بيع أصلية");
    if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(original.status)) {
      throw new ApiError(400, "لا يمكن الإرجاع على فاتورة معلقة أو ملغاة");
    }

    // التحقق من الكميات المسموح إرجاعها
    for (const it of items) {
      const orig = original.items.find((x) => x.id === it.invoiceItemId);
      if (!orig) throw new ApiError(400, "صنف مرتجع غير موجود في الفاتورة الأصلية");
      const refundable = orig.qty - orig.refundedQty;
      if (Number(it.qty) <= 0 || Number(it.qty) > refundable) {
        throw new ApiError(400, `${orig.name}: الكمية القابلة للإرجاع هي ${refundable} فقط`);
      }
    }

    const refund = await db.$transaction(async (tx) => {
      const no = await nextNumber(tx, "invoice");
      const lines = items.map((it: any) => {
        const orig = original!.items.find((x) => x.id === it.invoiceItemId)!;
        const qty = Number(it.qty);
        const unitDiscount = orig.discount / orig.qty;
        const unitTax = orig.taxAmount / orig.qty;
        return {
          orig, qty,
          base: round2((orig.unitPrice - unitDiscount) * qty),
          taxAmount: round2(unitTax * qty),
          total: round2((orig.unitPrice - unitDiscount + unitTax) * qty),
        };
      });
      const subtotal = round2(lines.reduce((s, l) => s + l.orig.unitPrice * l.qty, 0));
      const itemDiscount = round2(lines.reduce((s, l) => s + unitD(l), 0));
      const tax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
      const total = round2(lines.reduce((s, l) => s + l.total, 0));

      const inv = await tx.invoice.create({
        data: {
          no, type: "RETURN", status: "COMPLETED",
          customerId: original.customerId,
          userId: user.id, branchId: original.branchId,
          subtotal, itemDiscount, invoiceDiscount: 0, tax, total,
          paid: total, changeDue: 0,
          paymentMethod: "CASH",
          originalInvoiceId: original.id,
          eInvoiceUuid: crypto.randomUUID(),
          notes: reason || notes || "مرتجع نقدي",
        },
      });

      for (const l of lines) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: inv.id,
            productId: l.orig.productId,
            batchId: l.orig.batchId,
            name: l.orig.name,
            qty: l.qty,
            unitId: l.orig.unitId,
            unitName: l.orig.unitName,
            unitFactor: l.orig.unitFactor || 1,
            baseQty: round2(l.qty * (l.orig.unitFactor || 1)),
            unitPrice: l.orig.unitPrice,
            discount: unitD(l),
            taxRate: l.orig.taxRate,
            taxAmount: l.taxAmount,
            total: l.total,
            costPrice: l.orig.costPrice,
          },
        });
        // استعادة المخزون لنفس التشغيلة — بالمكافئ الأساسي (Multi-UoM)
        const restoreQty = round2(l.qty * (l.orig.unitFactor || 1));
        if (l.orig.batchId) {
          const batch = await tx.batch.findUnique({ where: { id: l.orig.batchId } });
          if (batch) {
            await tx.batch.update({ where: { id: batch.id }, data: { quantity: { increment: restoreQty } } });
          } else {
            const newBatch = await tx.batch.create({
              data: {
                productId: l.orig.productId!, branchId: original.branchId,
                batchNo: "RETURN", expiryDate: new Date(Date.now() + 365 * 86400000),
                quantity: restoreQty, costPrice: l.orig.costPrice,
              },
            });
            await tx.invoiceItem.updateMany({ where: { invoiceId: inv.id, name: l.orig.name }, data: { batchId: newBatch.id } });
          }
          await recordMovement(tx, {
            productId: l.orig.productId!, batchId: l.orig.batchId, branchId: original.branchId,
            type: "SALE_REFUND", quantity: restoreQty, refType: "RETURN", refId: no,
            note: `مرتجع على فاتورة ${original.no}${(l.orig.unitFactor || 1) !== 1 ? ` — ${l.qty} ${l.orig.unitName || "وحدة"} (المكافئ ${restoreQty})` : ""}`, userId: user.id,
          });
        }
        // تحديث الكمية المرتجعة في الفاتورة الأصلية
        await tx.invoiceItem.update({ where: { id: l.orig.id }, data: { refundedQty: { increment: l.qty } } });
      }

      // حالة الفاتورة الأصلية
      const refreshed = await tx.invoiceItem.findMany({ where: { invoiceId: original.id } });
      const fully = refreshed.every((x) => x.refundedQty >= x.qty);
      await tx.invoice.update({ where: { id: original.id }, data: { status: fully ? "REFUNDED" : "PARTIALLY_REFUNDED" } });

      // عكس نقاط الولاء والرصيد الآجل
      if (original.customer) {
        const pointsRevoke = settings.loyaltyEnabled ? Math.min(original.customer.loyaltyPoints, Math.floor(total / Math.max(1, settings.loyaltyEarnRate))) : 0;
        if (pointsRevoke > 0) {
          await tx.customer.update({ where: { id: original.customer.id }, data: { loyaltyPoints: { decrement: pointsRevoke } } });
        }
        if (original.paymentMethod === "CREDIT") {
          await tx.customer.update({ where: { id: original.customer.id }, data: { creditBalance: { decrement: total } } });
        }
      }
      return inv;
    });

    await logAudit({
      userId: user.id, userName: user.fullName, action: "REFUND", entity: "Invoice", entityId: refund.id,
      details: `مرتجع ${refund.no} على الفاتورة الأصلية ${original.no} — إجمالي ${refund.total} جنيه`,
    });
    return NextResponse.json(refund, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

function unitD(l: any): number {
  return round2((l.orig.discount / l.orig.qty) * l.qty);
}

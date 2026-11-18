import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { getSettings, nextNumber, allocateFefo, recordMovement, logAudit, round2 } from "@/lib/server/core";

/** قائمة الفواتير مع فلاتر */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const type = searchParams.get("type") || undefined;
    const status = searchParams.get("status") || undefined;
    const paymentMethod = searchParams.get("paymentMethod") || undefined;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const customerId = searchParams.get("customerId") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (customerId) where.customerId = customerId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) { const t = new Date(dateTo); t.setHours(23, 59, 59, 999); where.createdAt.lte = t; }
    }
    if (q) {
      where.OR = [{ no: { contains: q } }, { customer: { name: { contains: q } } }];
    }

    const [items, total] = await Promise.all([
      db.invoice.findMany({
        where,
        include: { customer: { select: { name: true, code: true } }, user: { select: { fullName: true } }, branch: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.invoice.count({ where }),
    ]);
    return NextResponse.json({ items, total, page, pageSize: limit });
  } catch (e) {
    return handleApiError(e);
  }
}

/** إنشاء فاتورة بيع (نقطة البيع) — خصم المخزون FEFO داخل معاملة ذرية */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "CASHIER"]);
    const settings = await getSettings();
    const body = await req.json();
    const {
      items, customerId, paymentMethod, invoiceDiscount = 0, invoiceDiscountType = "FIXED",
      couponCode, redeemPoints = 0, branchId, heldInvoiceId, prescriptionId, notes,
    } = body ?? {};

    if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "السلة فارغة — أضف أصنافاً أولاً");
    if (!branchId) throw new ApiError(400, "حدد الفرع");

    // صلاحية الخصم للكاشير
    if (user.role === "CASHIER" && invoiceDiscountType === "PERCENT" && Number(invoiceDiscount) > settings.cashierMaxDiscount) {
      throw new ApiError(403, `أقصى خصم مسموح للكاشير هو ${settings.cashierMaxDiscount}٪ — راجع المدير`);
    }

    const invoice = await db.$transaction(async (tx) => {
      const customer = customerId ? await tx.customer.findUnique({ where: { id: customerId } }) : null;
      if (customerId && !customer) throw new ApiError(404, "العميل غير موجود");
      if ((paymentMethod === "CREDIT" || paymentMethod === "INSURANCE") && !customer) {
        throw new ApiError(400, paymentMethod === "CREDIT" ? "البيع الآجل يتطلب اختيار عميل مسجل" : "البيع بالتأمين يتطلب اختيار عميل مسجل");
      }

      // ── بنود الفاتورة + خصم المخزون ──
      const lines: any[] = [];
      for (const it of items) {
        if (!it.productId || !it.qty || it.qty <= 0) throw new ApiError(400, "صنف غير صالح في السلة");
        const product = await tx.product.findUnique({ where: { id: it.productId } });
        if (!product) throw new ApiError(404, `المنتج غير موجود`);
        if (!product.isActive) throw new ApiError(400, `${product.tradeName}: هذا المنتج معطّل`);
        const qty = Number(it.qty);
        const unitPrice = product.sellPrice;
        const discount = Math.max(0, Number(it.discount || 0));
        const base = unitPrice * qty;
        const net = Math.max(0, base - discount);
        const taxAmount = round2((net * product.taxRate) / 100);
        const total = round2(net + taxAmount);
        const allocs = await allocateFefo(tx, product.id, branchId, qty, product.tradeName);
        lines.push({
          productId: product.id, name: product.tradeName, qty, unitPrice, discount,
          taxRate: product.taxRate, taxAmount, total, costPrice: allocs.length ? round2(allocs.reduce((s, a) => s + a.costPrice * a.qty, 0) / qty) : 0,
          allocs,
        });
      }

      const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0));
      const itemDiscount = round2(lines.reduce((s, l) => s + l.discount, 0));

      // ── خصم الفاتورة ──
      let invDiscount = 0;
      if (invoiceDiscountType === "PERCENT") {
        invDiscount = round2(((subtotal - itemDiscount) * Math.max(0, Number(invoiceDiscount))) / 100);
      } else {
        invDiscount = round2(Math.max(0, Number(invoiceDiscount)));
      }
      // الكوبون
      if (couponCode) {
        const coupon = await tx.coupon.findUnique({ where: { code: String(couponCode).toUpperCase() } });
        if (!coupon || !coupon.isActive) throw new ApiError(400, "الكوبون غير صالح");
        if (coupon.type === "PERCENT") invDiscount += round2(((subtotal - itemDiscount) * coupon.value) / 100);
        else invDiscount += round2(coupon.value);
      }

      // ── استبدال نقاط الولاء ──
      let pointsRedeemed = 0;
      let redeemValue = 0;
      if (redeemPoints > 0 && settings.loyaltyEnabled && customer) {
        pointsRedeemed = Math.min(Number(redeemPoints), customer.loyaltyPoints);
        redeemValue = round2(pointsRedeemed * settings.loyaltyRedeemRate);
        invDiscount += redeemValue;
      }

      const tax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
      const total = round2(subtotal - itemDiscount - invDiscount + tax);
      if (total < 0) throw new ApiError(400, "قيمة الفاتورة غير صالحة — تحقق من الخصومات");

      const no = await nextNumber(tx, "invoice");
      const inv = await tx.invoice.create({
        data: {
          no, type: "SALE", status: "COMPLETED",
          customerId: customer?.id || null,
          userId: user.id, branchId,
          subtotal, itemDiscount, invoiceDiscount: invDiscount, tax, total,
          paid: Number(body.paid ?? total), changeDue: round2(Math.max(0, Number(body.paid ?? total) - total)),
          paymentMethod: paymentMethod || settings.defaultPaymentMethod || "CASH",
          prescriptionId: prescriptionId || null,
          eInvoiceUuid: crypto.randomUUID(),
          loyaltyPointsEarned: settings.loyaltyEnabled ? Math.floor(total / Math.max(1, settings.loyaltyEarnRate)) : 0,
          loyaltyPointsRedeemed: pointsRedeemed,
          notes: notes || null,
        },
      });

      for (const l of lines) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: inv.id, productId: l.productId, batchId: l.allocs[0]?.batchId || null,
            name: l.name, qty: l.qty, unitPrice: l.unitPrice, discount: l.discount,
            taxRate: l.taxRate, taxAmount: l.taxAmount, total: l.total, costPrice: l.costPrice,
          },
        });
        for (const a of l.allocs) {
          await recordMovement(tx, {
            productId: l.productId, batchId: a.batchId, branchId,
            type: "SALE", quantity: -a.qty, refType: "INVOICE", refId: no, userId: user.id,
          });
        }
      }

      // ── العميل: نقاط الولاء + الرصيد الآجل ──
      if (customer) {
        if (settings.loyaltyEnabled && inv.loyaltyPointsEarned > 0) {
          await tx.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: { increment: inv.loyaltyPointsEarned } } });
        }
        if (pointsRedeemed > 0) {
          await tx.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: { decrement: pointsRedeemed } } });
        }
        if (inv.paymentMethod === "CREDIT") {
          await tx.customer.update({ where: { id: customer.id }, data: { creditBalance: { increment: total } } });
        }
      }

      // ── ربط الوصفة الطبية ──
      if (prescriptionId) {
        const rx = await tx.prescription.findUnique({ where: { id: prescriptionId }, include: { items: true } });
        if (rx) {
          for (const ri of rx.items) {
            if (ri.productId) {
              const soldQty = lines.filter((l) => l.productId === ri.productId).reduce((s, l) => s + l.qty, 0);
              if (soldQty > 0) {
                await tx.prescriptionItem.update({ where: { id: ri.id }, data: { dispensedQty: soldQty } });
              }
            }
          }
          await tx.prescription.update({ where: { id: prescriptionId }, data: { status: "DISPENSED", invoiceId: inv.id } });
        }
      }

      // ── إلغاء الفاتورة المعلقة إن وجدت ──
      if (heldInvoiceId) {
        await tx.invoice.updateMany({ where: { id: heldInvoiceId, status: "HELD" }, data: { status: "CANCELLED" } });
      }

      return inv;
    });

    await logAudit({
      userId: user.id, userName: user.fullName, action: "SALE", entity: "Invoice", entityId: invoice.id,
      details: `فاتورة بيع ${invoice.no} — إجمالي ${invoice.total} جنيه (${invoice.paymentMethod})`,
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

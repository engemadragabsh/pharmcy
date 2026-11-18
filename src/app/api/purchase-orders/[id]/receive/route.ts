import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit, nextNumber, recordMovement } from "@/lib/server/core";

/** استلام بضاعة (GRN) لأمر شراء — ينشئ التشغيلات وحركات المخزون */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req, ["ADMIN", "INVENTORY_MANAGER"]);
    const { id: poId } = await params;
    const body = await req.json();
    const { lines, notes } = body ?? {};
    if (!Array.isArray(lines) || lines.length === 0) throw new ApiError(400, "أضف أصناف الاستلام");

    for (const l of lines) {
      if (!l.productId || !l.batchNo?.trim() || !l.expiryDate || !l.qty || l.qty <= 0) {
        throw new ApiError(400, "بيانات استلام غير مكتملة: كل صنف يحتاج تشغيلة وصلاحية وكمية");
      }
      if (new Date(l.expiryDate).getTime() < Date.now()) {
        throw new ApiError(400, "لا يمكن استلام تشغيلة منتهية الصلاحية");
      }
    }

    const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true, supplier: true } });
    if (!po) throw new ApiError(404, "أمر الشراء غير موجود");
    if (po.status === "RECEIVED") throw new ApiError(400, "تم استلام هذا الأمر بالكامل مسبقاً");

    const result = await db.$transaction(async (tx) => {
      const no = await nextNumber(tx, "grn");
      const subtotal = lines.reduce((s: number, l: any) => s + l.qty * l.unitCost, 0);

      const grn = await tx.goodsReceipt.create({
        data: {
          no,
          supplierId: po.supplierId,
          purchaseOrderId: po.id,
          branchId: po.branchId,
          userId: user.id,
          subtotal,
          total: subtotal,
          notes: notes || null,
          items: {
            create: lines.map((l: any) => ({
              productId: l.productId,
              batchNo: String(l.batchNo).trim(),
              expiryDate: new Date(l.expiryDate),
              qty: Number(l.qty),
              unitCost: Number(l.unitCost),
              shelfLocation: l.shelfLocation || null,
            })),
          },
        },
      });

      let allReceived = true;
      for (const l of lines) {
        // إنشاء التشغيلة أو إضافة للكمية
        const existing = await tx.batch.findFirst({
          where: { productId: l.productId, branchId: po.branchId, batchNo: String(l.batchNo).trim() },
        });
        let batch;
        if (existing) {
          batch = await tx.batch.update({
            where: { id: existing.id },
            data: { quantity: { increment: Number(l.qty) }, expiryDate: new Date(l.expiryDate), costPrice: Number(l.unitCost) },
          });
        } else {
          batch = await tx.batch.create({
            data: {
              productId: l.productId,
              branchId: po.branchId,
              batchNo: String(l.batchNo).trim(),
              expiryDate: new Date(l.expiryDate),
              quantity: Number(l.qty),
              costPrice: Number(l.unitCost),
              shelfLocation: l.shelfLocation || null,
            },
          });
        }
        await recordMovement(tx, {
          productId: l.productId,
          batchId: batch.id,
          branchId: po.branchId,
          type: "RECEIVE",
          quantity: Number(l.qty),
          refType: "GRN",
          refId: no,
          note: `استلام من ${po.supplier.name}`,
          userId: user.id,
        });
        // تحديث المستلم في أمر الشراء
        await tx.purchaseOrderItem.updateMany({
          where: { orderId: po.id, productId: l.productId },
          data: { receivedQty: { increment: Number(l.qty) } },
        });
      }
      // هل استُلم كل شيء؟
      const items = await tx.purchaseOrderItem.findMany({ where: { orderId: po.id } });
      allReceived = items.every((it) => it.receivedQty >= it.qty);
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
      });
      // رصيد المورد
      await tx.supplier.update({ where: { id: po.supplierId }, data: { balance: { increment: subtotal } } });
      return grn;
    });

    await logAudit({ userId: user.id, userName: user.fullName, action: "GRN_RECEIVE", entity: "GoodsReceipt", entityId: result.id, details: `استلام ${lines.length} صنف من ${po.supplier.name} — مستند ${result.no}` });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

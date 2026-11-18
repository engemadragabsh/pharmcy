import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit, nextNumber } from "@/lib/server/core";

/** قائمة أوامر الشراء */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN", "ACCOUNTANT", "INVENTORY_MANAGER", "PHARMACIST"]);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const where: any = status ? { status } : {};
    const items = await db.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        user: { select: { fullName: true } },
        items: { include: { product: { select: { tradeName: true, tradeNameEn: true } } } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

/** إنشاء أمر شراء */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "INVENTORY_MANAGER"]);
    const body = await req.json();
    const { supplierId, branchId, items, expectedAt, notes, send } = body ?? {};
    if (!supplierId || !branchId) throw new ApiError(400, "حدد المورد والفرع");
    if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "أضف أصناف أمر الشراء");
    for (const it of items) {
      if (!it.productId || !it.qty || it.qty <= 0) throw new ApiError(400, "صنف غير صالح — الكمية يجب أن تكون أكبر من صفر");
      if (it.unitCost == null || it.unitCost < 0) throw new ApiError(400, "سعر الوحدة مطلوب لكل صنف");
    }

    const subtotal = items.reduce((s: number, it: any) => s + it.qty * it.unitCost, 0);
    const po = await db.$transaction(async (tx) => {
      const no = await nextNumber(tx, "po");
      return tx.purchaseOrder.create({
        data: {
          no,
          supplierId,
          branchId,
          userId: user.id,
          status: send ? "SENT" : "DRAFT",
          subtotal,
          tax: 0,
          total: subtotal,
          expectedAt: expectedAt ? new Date(expectedAt) : null,
          notes: notes || null,
          items: { create: items.map((it: any) => ({ productId: it.productId, qty: Number(it.qty), unitCost: Number(it.unitCost) })) },
        },
        include: { items: true },
      });
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "PO_CREATE", entity: "PurchaseOrder", entityId: po.id, details: `أمر شراء ${po.no} — ${items.length} صنف — إجمالي ${subtotal}` });
    return NextResponse.json(po, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

/** إرسال أمر شراء (DRAFT → SENT) أو إلغاؤه */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "INVENTORY_MANAGER"]);
    const body = await req.json();
    const { id, status } = body ?? {};
    if (!id || !["SENT", "CANCELLED"].includes(status)) throw new ApiError(400, "حدد الأمر والحالة المطلوبة (إرسال/إلغاء)");
    const po = await db.purchaseOrder.update({ where: { id }, data: { status } });
    await logAudit({ userId: user.id, userName: user.fullName, action: status === "SENT" ? "PO_SEND" : "PO_CANCEL", entity: "PurchaseOrder", entityId: id, details: `${status === "SENT" ? "إرسال" : "إلغاء"} أمر الشراء ${po.no}` });
    return NextResponse.json(po);
  } catch (e) {
    return handleApiError(e);
  }
}

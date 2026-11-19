import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";

/** الفواتير المعلقة (Hold) — عرض / تعليق / حذف بعد الاسترجاع */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const held = await db.invoice.findMany({
      where: { status: "HELD" },
      include: { customer: { select: { name: true } }, user: { select: { fullName: true } }, items: true },
      orderBy: { heldAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ items: held });
  } catch (e) {
    return handleApiError(e);
  }
}

/** تعليق سلة كفاتورة معلقة */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "CASHIER"]);
    const body = await req.json();
    const { items, customerId, notes } = body ?? {};
    if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "السلة فارغة");

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const held = await db.$transaction(async (tx) => {
      const s = await tx.settings.findUnique({ where: { id: "main" } });
      const no = `HLD-${String(s?.nextInvoiceSeq || 1).padStart(5, "0")}`;
      const subtotal = round2(items.reduce((acc: number, it: any) => acc + (Number(it.unitPrice) || 0) * Number(it.qty || 0), 0));
      const itemDiscount = round2(items.reduce((acc: number, it: any) => acc + (Number(it.discount) || 0), 0));
      const tax = round2(items.reduce((acc: number, it: any) => {
        const net = (Number(it.unitPrice) || 0) * Number(it.qty || 0) - (Number(it.discount) || 0);
        return acc + (net * (Number(it.taxRate) || 14)) / 100;
      }, 0));
      return tx.invoice.create({
        data: {
          no, type: "SALE", status: "HELD",
          customerId: customerId || null,
          userId: user.id, branchId: body.branchId || user.branchId || "",
          subtotal, itemDiscount, invoiceDiscount: Number(body.invoiceDiscount || 0),
          tax, total: round2(subtotal - itemDiscount + tax),
          paymentMethod: "CASH",
          notes: notes || "فاتورة معلقة",
          heldAt: new Date(),
          items: {
            create: items.map((it: any) => {
              const net = (Number(it.unitPrice) || 0) * Number(it.qty || 0) - (Number(it.discount) || 0);
              const rate = Number(it.taxRate) || 14;
              return {
                productId: it.productId || null,
                name: it.name || "صنف",
                qty: Number(it.qty || 1),
                unitPrice: Number(it.unitPrice || 0),
                discount: Number(it.discount || 0),
                taxRate: rate,
                taxAmount: round2((net * rate) / 100),
                total: round2(net * (1 + rate / 100)),
              };
            }),
          },
        },
      });
    });
    return NextResponse.json(held, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

/** حذف فاتورة معلقة (بعد استرجاعها في السلة أو إلغائها) */
export async function DELETE(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN", "PHARMACIST", "CASHIER"]);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError(400, "معرّف الفاتورة المعلقة مطلوب");
    const held = await db.invoice.findUnique({ where: { id } });
    if (!held || held.status !== "HELD") throw new ApiError(404, "الفاتورة المعلقة غير موجودة");
    await db.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await db.invoice.delete({ where: { id } });
    return NextResponse.json({ message: "تم استرجاع السلة" });
  } catch (e) {
    return handleApiError(e);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { nextNumber, allocateFefo, recordMovement, logAudit } from "@/lib/server/core";

/** قائمة الوصفات الطبية */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const q = searchParams.get("q")?.trim() || undefined;
    const where: any = status ? { status } : {};
    if (q) where.OR = [{ no: { contains: q } }, { customer: { name: { contains: q } } }];

    const items = await db.prescription.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, code: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
        items: { include: { product: { select: { tradeName: true, tradeNameEn: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

/** تسجيل وصفة جديدة */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "CASHIER"]);
    const body = await req.json();
    const { customerId, doctorId, items, notes, source } = body ?? {};
    if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "أضف أصناف الوصفة");
    for (const it of items) {
      if (!it.productName?.trim() || !it.qty || it.qty <= 0) throw new ApiError(400, "كل صنف يحتاج اسم دواء وكمية صحيحة");
    }

    const rx = await db.$transaction(async (tx) => {
      const no = await nextNumber(tx, "rx");
      return tx.prescription.create({
        data: {
          no,
          customerId: customerId || null,
          doctorId: doctorId || null,
          branchId: user.branchId,
          userId: user.id,
          status: "PENDING",
          source: source || "MANUAL",
          notes: notes || null,
          items: {
            create: items.map((it: any) => ({
              productId: it.productId || null,
              productName: String(it.productName).trim(),
              dosage: it.dosage || null,
              qty: Number(it.qty),
            })),
          },
        },
        include: { items: true },
      });
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "RX_CREATE", entity: "Prescription", entityId: rx.id, details: `وصفة ${rx.no} — ${items.length} صنف` });
    return NextResponse.json(rx, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

/** صرف أو إلغاء وصفة — الصرف يخصم المخزون FEFO */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST"]);
    const body = await req.json();
    const { id, action } = body ?? {};
    if (!id) throw new ApiError(400, "معرّف الوصفة مطلوب");

    const rx = await db.prescription.findUnique({ where: { id }, include: { items: true } });
    if (!rx) throw new ApiError(404, "الوصفة غير موجودة");

    if (action === "dispense") {
      if (rx.status === "DISPENSED") throw new ApiError(400, "تم صرف هذه الوصفة مسبقاً");
      if (rx.status === "CANCELLED") throw new ApiError(400, "الوصفة ملغاة");
      await db.$transaction(async (tx) => {
        for (const item of rx.items) {
          if (!item.productId) continue;
          const remaining = item.qty - item.dispensedQty;
          if (remaining <= 0) continue;
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product) continue;
          const allocs = await allocateFefo(tx, item.productId, rx.branchId || user.branchId || "", remaining, product.tradeName);
          for (const a of allocs) {
            await recordMovement(tx, {
              productId: item.productId, batchId: a.batchId, branchId: rx.branchId || user.branchId || "",
              type: "ISSUE", quantity: -a.qty, refType: "PRESCRIPTION", refId: rx.no,
              note: "صرف وصفة طبية", userId: user.id,
            });
          }
          await tx.prescriptionItem.update({ where: { id: item.id }, data: { dispensedQty: item.qty } });
        }
        await tx.prescription.update({ where: { id }, data: { status: "DISPENSED" } });
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "RX_DISPENSE", entity: "Prescription", entityId: id, details: `صرف وصفة ${rx.no} وخصم المخزون` });
      return NextResponse.json({ message: "تم صرف الوصفة وخصم المخزون بنجاح" });
    }

    if (action === "cancel") {
      await db.prescription.update({ where: { id }, data: { status: "CANCELLED" } });
      await logAudit({ userId: user.id, userName: user.fullName, action: "RX_CANCEL", entity: "Prescription", entityId: id, details: `إلغاء وصفة ${rx.no}` });
      return NextResponse.json({ message: "تم إلغاء الوصفة" });
    }

    throw new ApiError(400, "عملية غير معروفة");
  } catch (e) {
    return handleApiError(e);
  }
}

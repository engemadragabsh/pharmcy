import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** المخازن والمستودعات — CRUD كامل (الكتابة للمدير فقط) */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const items = await db.warehouse.findMany({
      include: {
        branch: { select: { id: true, name: true, nameEn: true, code: true } },
        _count: { select: { batches: true } },
      },
      orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
    });
    // إجمالي الكميات المخزّنة لكل مخزن
    const sums = await db.batch.groupBy({
      by: ["warehouseId"],
      _sum: { quantity: true },
      where: { warehouseId: { not: null } },
    });
    const sumMap = new Map(sums.map((s) => [s.warehouseId, s._sum.quantity || 0]));
    return NextResponse.json({
      items: items.map((w) => ({ ...w, totalQty: sumMap.get(w.id) || 0 })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const body = await req.json();
    if (!body.code?.trim() || !body.name?.trim()) throw new ApiError(400, "كود واسم المخزن مطلوبان");
    const code = String(body.code).trim();
    const dup = await db.warehouse.findUnique({ where: { code } });
    if (dup) throw new ApiError(400, "كود المخزن مستخدم بالفعل");
    if (body.branchId) {
      const branch = await db.branch.findUnique({ where: { id: String(body.branchId) } });
      if (!branch) throw new ApiError(400, "الفرع المحدد غير موجود");
    }
    if (body.isMain) await db.warehouse.updateMany({ data: { isMain: false } });
    const wh = await db.warehouse.create({
      data: {
        code,
        name: String(body.name).trim(),
        nameEn: body.nameEn || String(body.name).trim(),
        branchId: body.branchId || null,
        location: body.location || null,
        phone: body.phone || null,
        manager: body.manager || null,
        notes: body.notes || null,
        isMain: !!body.isMain,
        isActive: body.isActive !== undefined ? !!body.isActive : true,
      },
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "WAREHOUSE_CREATE", entity: "Warehouse", entityId: wh.id, details: `إضافة مخزن: ${wh.name}` });
    return NextResponse.json(wh, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const body = await req.json();
    if (!body.id) throw new ApiError(400, "معرّف المخزن مطلوب");
    if (body.branchId) {
      const branch = await db.branch.findUnique({ where: { id: String(body.branchId) } });
      if (!branch) throw new ApiError(400, "الفرع المحدد غير موجود");
    }
    if (body.isMain) await db.warehouse.updateMany({ data: { isMain: false } });
    const wh = await db.warehouse.update({
      where: { id: body.id },
      data: {
        name: body.name != null ? String(body.name).trim() : undefined,
        nameEn: body.nameEn !== undefined ? body.nameEn : undefined,
        branchId: body.branchId !== undefined ? (body.branchId || null) : undefined,
        location: body.location !== undefined ? (body.location || null) : undefined,
        phone: body.phone !== undefined ? (body.phone || null) : undefined,
        manager: body.manager !== undefined ? (body.manager || null) : undefined,
        notes: body.notes !== undefined ? (body.notes || null) : undefined,
        isMain: body.isMain !== undefined ? !!body.isMain : undefined,
        isActive: body.isActive !== undefined ? !!body.isActive : undefined,
      },
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "WAREHOUSE_UPDATE", entity: "Warehouse", entityId: wh.id, details: `تعديل مخزن: ${wh.name}` });
    return NextResponse.json(wh);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError(400, "معرّف المخزن مطلوب");
    const wh = await db.warehouse.findUnique({ where: { id }, include: { batches: { take: 1 } } });
    if (!wh) throw new ApiError(404, "المخزن غير موجود");
    if (wh.batches.length > 0) {
      await db.warehouse.update({ where: { id }, data: { isActive: false } });
      await logAudit({ userId: user.id, userName: user.fullName, action: "WAREHOUSE_DEACTIVATE", entity: "Warehouse", entityId: wh.id, details: `تعطيل مخزن (مرتبط بمخزون): ${wh.name}` });
      return NextResponse.json({ message: "تم تعطيل المخزن (مرتبط بمخزون — لا يمكن حذفه)" });
    }
    await db.warehouse.delete({ where: { id } });
    await logAudit({ userId: user.id, userName: user.fullName, action: "WAREHOUSE_DELETE", entity: "Warehouse", entityId: wh.id, details: `حذف مخزن: ${wh.name}` });
    return NextResponse.json({ message: "تم حذف المخزن" });
  } catch (e) {
    return handleApiError(e);
  }
}

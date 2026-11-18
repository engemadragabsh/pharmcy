import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** الفروع والمستودعات */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const items = await db.branch.findMany({
      include: { _count: { select: { users: true, batches: true } } },
      orderBy: { isDefault: "desc" },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const body = await req.json();
    if (!body.code?.trim() || !body.name?.trim()) throw new ApiError(400, "كود واسم الفرع مطلوبان");
    const dup = await db.branch.findUnique({ where: { code: String(body.code).trim() } });
    if (dup) throw new ApiError(400, "كود الفرع مستخدم بالفعل");
    const branch = await db.branch.create({
      data: {
        code: String(body.code).trim(),
        name: String(body.name).trim(),
        nameEn: body.nameEn || String(body.name).trim(),
        address: body.address || null,
        phone: body.phone || null,
        isDefault: !!body.isDefault,
      },
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "BRANCH_CREATE", entity: "Branch", entityId: branch.id, details: `إضافة فرع: ${branch.name}` });
    return NextResponse.json(branch, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const body = await req.json();
    if (!body.id) throw new ApiError(400, "معرّف الفرع مطلوب");
    if (body.isDefault) {
      await db.branch.updateMany({ data: { isDefault: false } });
    }
    const branch = await db.branch.update({
      where: { id: body.id },
      data: {
        name: body.name != null ? String(body.name).trim() : undefined,
        nameEn: body.nameEn !== undefined ? body.nameEn : undefined,
        address: body.address !== undefined ? body.address : undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
        isDefault: body.isDefault !== undefined ? !!body.isDefault : undefined,
        isActive: body.isActive !== undefined ? !!body.isActive : undefined,
      },
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "BRANCH_UPDATE", entity: "Branch", entityId: branch.id, details: `تعديل فرع: ${branch.name}` });
    return NextResponse.json(branch);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError(400, "معرّف الفرع مطلوب");
    const branch = await db.branch.findUnique({ where: { id }, include: { batches: { take: 1 }, invoices: { take: 1 } } });
    if (!branch) throw new ApiError(404, "الفرع غير موجود");
    if (branch.batches.length > 0 || branch.invoices.length > 0) {
      await db.branch.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ message: "تم تعطيل الفرع (مرتبط ببيانات تشغيلية)" });
    }
    await db.branch.delete({ where: { id } });
    return NextResponse.json({ message: "تم حذف الفرع" });
  } catch (e) {
    return handleApiError(e);
  }
}

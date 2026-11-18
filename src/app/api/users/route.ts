import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** إدارة المستخدمين والصلاحيات */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const items = await db.user.findMany({
      select: { id: true, username: true, fullName: true, fullNameEn: true, role: true, pin: true, phone: true, branchId: true, isActive: true, lastLoginAt: true, createdAt: true, branch: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAuth(req, ["ADMIN"]);
    const body = await req.json();
    const { username, password, fullName, role } = body ?? {};
    if (!username?.trim() || !password || !fullName?.trim() || !role) {
      throw new ApiError(400, "اسم المستخدم وكلمة المرور والاسم الكامل والدور مطلوبة");
    }
    if (String(password).length < 6) throw new ApiError(400, "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    const dup = await db.user.findUnique({ where: { username: String(username).trim() } });
    if (dup) throw new ApiError(400, "اسم المستخدم مستخدم بالفعل");

    const user = await db.user.create({
      data: {
        username: String(username).trim(),
        passwordHash: bcrypt.hashSync(String(password), 10),
        fullName: String(fullName).trim(),
        fullNameEn: body.fullNameEn || null,
        role,
        pin: body.pin || null,
        phone: body.phone || null,
        branchId: body.branchId || null,
        isActive: true,
      },
    });
    await logAudit({ userId: admin.id, userName: admin.fullName, action: "USER_CREATE", entity: "User", entityId: user.id, details: `إنشاء مستخدم ${user.username} (${user.role})` });
    return NextResponse.json({ id: user.id, username: user.username, role: user.role }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAuth(req, ["ADMIN"]);
    const body = await req.json();
    if (!body.id) throw new ApiError(400, "معرّف المستخدم مطلوب");
    const data: any = {};
    if (body.fullName != null) data.fullName = String(body.fullName).trim();
    if (body.fullNameEn !== undefined) data.fullNameEn = body.fullNameEn;
    if (body.role != null) data.role = body.role;
    if (body.pin !== undefined) data.pin = body.pin || null;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.branchId !== undefined) data.branchId = body.branchId || null;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.password) {
      if (String(body.password).length < 6) throw new ApiError(400, "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      data.passwordHash = bcrypt.hashSync(String(body.password), 10);
    }
    const user = await db.user.update({ where: { id: body.id }, data });
    await logAudit({ userId: admin.id, userName: admin.fullName, action: "USER_UPDATE", entity: "User", entityId: body.id, details: `تعديل مستخدم ${user.username}` });
    return NextResponse.json({ id: user.id, username: user.username, role: user.role });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAuth(req, ["ADMIN"]);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) throw new ApiError(400, "معرّف المستخدم مطلوب");
    if (id === admin.id) throw new ApiError(400, "لا يمكنك تعطيل حسابك الخاص");
    const user = await db.user.update({ where: { id }, data: { isActive: false } });
    await logAudit({ userId: admin.id, userName: admin.fullName, action: "USER_DISABLE", entity: "User", entityId: id, details: `تعطيل مستخدم ${user.username}` });
    return NextResponse.json({ message: "تم تعطيل المستخدم" });
  } catch (e) {
    return handleApiError(e);
  }
}

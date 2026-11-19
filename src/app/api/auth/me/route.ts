import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/server/auth";

/** بيانات المستخدم الحالي + الفروع */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const user = await db.user.findUnique({
      where: { id: session.id },
      select: { id: true, username: true, fullName: true, fullNameEn: true, role: true, branchId: true, lastLoginAt: true },
    });
    const branches = await db.branch.findMany({ where: { isActive: true }, orderBy: { isDefault: "desc" } });
    return NextResponse.json({ user, branches });
  } catch (e) {
    return handleApiError(e);
  }
}

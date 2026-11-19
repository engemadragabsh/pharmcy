import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signAccessToken, signRefreshToken, handleApiError, ApiError, SessionUser } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** تسجيل دخول سريع بـ PIN للكاشير */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pin } = body ?? {};
    if (!pin || String(pin).length !== 4) throw new ApiError(400, "أدخل رمز PIN المكوّن من 4 أرقام");

    const user = await db.user.findFirst({ where: { pin: String(pin), isActive: true } });
    if (!user) throw new ApiError(401, "رمز PIN غير صحيح");

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const session: SessionUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      branchId: user.branchId,
    };
    const [accessToken, refreshToken] = await Promise.all([signAccessToken(session), signRefreshToken(user.id)]);
    await logAudit({ userId: session.id, userName: session.fullName, action: "LOGIN", entity: "Auth", details: "تسجيل دخول بـ PIN سريع" });

    const branches = await db.branch.findMany({ where: { isActive: true }, orderBy: { isDefault: "desc" } });
    return NextResponse.json({ accessToken, refreshToken, user: session, branches });
  } catch (e) {
    return handleApiError(e);
  }
}

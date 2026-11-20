import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signAccessToken, signRefreshToken, handleApiError, ApiError, SessionUser } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

// حماية بسيطة من الهجمات — 10 محاولات لكل دقيقة لكل IP
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  rec.count += 1;
  return rec.count <= 10;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    if (!rateLimit(ip)) throw new ApiError(429, "محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة");

    const body = await req.json();
    const { username, password } = body ?? {};
    if (!username || !password) throw new ApiError(400, "أدخل اسم المستخدم وكلمة المرور");

    // اسم المستخدم غير حساس لحالة الأحرف (Admin = admin = ADMIN) — كلمة المرور حساسة
    const uname = String(username).trim();
    const user = (await db.user.findUnique({ where: { username: uname } }))
      ?? (uname !== uname.toLowerCase() ? await db.user.findFirst({ where: { username: uname.toLowerCase() } }) : null);
    if (!user || !user.isActive) throw new ApiError(401, "اسم المستخدم أو كلمة المرور غير صحيحة — انتبه: كلمة المرور حساسة لحالة الأحرف (حروف كبيرة/صغيرة)");

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) throw new ApiError(401, "اسم المستخدم أو كلمة المرور غير صحيحة — انتبه: كلمة المرور حساسة لحالة الأحرف (حروف كبيرة/صغيرة)");

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const session: SessionUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      branchId: user.branchId,
    };
    const [accessToken, refreshToken] = await Promise.all([signAccessToken(session), signRefreshToken(user.id)]);
    await logAudit({ userId: session.id, userName: session.fullName, action: "LOGIN", entity: "Auth", details: "تسجيل دخول باسم المستخدم" });

    const branches = await db.branch.findMany({ where: { isActive: true }, orderBy: { isDefault: "desc" } });
    return NextResponse.json({ accessToken, refreshToken, user: session, branches });
  } catch (e) {
    return handleApiError(e);
  }
}

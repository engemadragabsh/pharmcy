/**
 * نظام المصادقة والصلاحيات — JWT + RBAC
 */
import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "shifaa-pharmacy-jwt-secret-2026-change-in-production"
);

export type Role = "ADMIN" | "PHARMACIST" | "CASHIER" | "ACCOUNTANT" | "INVENTORY_MANAGER";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  branchId: string | null;
}

export const ACCESS_TTL_SEC = 60 * 60; // ساعة
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 7; // أسبوع

export async function signAccessToken(user: SessionUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(SECRET);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ type: "refresh", userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SEC}s`)
    .sign(SECRET);
}

export async function verifyAccessToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload as any).user ?? null;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if ((payload as any).type !== "refresh") return null;
    return (payload as any).userId as string;
  } catch {
    return null;
  }
}

/** استخراج المستخدم من ترويسة Authorization */
export async function getAuth(req: Request): Promise<SessionUser | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (!token) return null;
  return verifyAccessToken(token);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** حرس المصادقة + الصلاحيات — يعيد المستخدم أو يرمي خطأ جاهزاً */
export async function requireAuth(req: Request, roles?: Role[]): Promise<SessionUser> {
  const user = await getAuth(req);
  if (!user) throw new ApiError(401, "غير مصرح — يرجى تسجيل الدخول من جديد");
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    throw new ApiError(403, "ليس لديك صلاحية لتنفيذ هذه العملية");
  }
  return user;
}

/** معالج الأخطاء الموحد لكل نقاط النهاية */
export function handleApiError(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[API Error]", e);
  const msg = e instanceof Error ? e.message : "حدث خطأ غير متوقع في الخادم";
  return NextResponse.json({ error: msg }, { status: 500 });
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRefreshToken, signAccessToken, signRefreshToken, handleApiError, ApiError } from "@/lib/server/auth";

/** تجديد رمز الوصول */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken } = body ?? {};
    if (!refreshToken) throw new ApiError(400, "رمز التجديد مفقود");

    const userId = await verifyRefreshToken(String(refreshToken));
    if (!userId) throw new ApiError(401, "رمز التجديد غير صالح أو منتهي");

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new ApiError(401, "المستخدم غير موجود أو معطّل");

    const session = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      branchId: user.branchId,
    };
    const [accessToken, newRefresh] = await Promise.all([signAccessToken(session), signRefreshToken(user.id)]);
    return NextResponse.json({ accessToken, refreshToken: newRefresh, user: session });
  } catch (e) {
    return handleApiError(e);
  }
}

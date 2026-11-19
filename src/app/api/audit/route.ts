import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/server/auth";

/** سجل العمليات (Audit Log) */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
    const q = searchParams.get("q")?.trim() || "";
    const where: any = q ? { OR: [{ userName: { contains: q } }, { action: { contains: q } }, { entity: { contains: q } }, { details: { contains: q } }] } : {};
    const [items, total] = await Promise.all([
      db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      db.auditLog.count({ where }),
    ]);
    return NextResponse.json({ items, total, page, pageSize: limit });
  } catch (e) {
    return handleApiError(e);
  }
}

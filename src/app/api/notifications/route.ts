import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/server/auth";

/** الإشعارات والتنبيهات */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const items = await db.notification.findMany({ orderBy: [{ isRead: "asc" }, { createdAt: "desc" }], take: 30 });
    const unread = items.filter((n) => !n.isRead).length;
    return NextResponse.json({ items, unread });
  } catch (e) {
    return handleApiError(e);
  }
}

/** تعليم الكل كمقروء */
export async function PUT(req: NextRequest) {
  try {
    await requireAuth(req);
    await db.notification.updateMany({ where: { isRead: false }, data: { isRead: true } });
    return NextResponse.json({ message: "تم تعليم جميع الإشعارات كمقروءة" });
  } catch (e) {
    return handleApiError(e);
  }
}

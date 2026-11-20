import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/**
 * النسخ الاحتياطي الحقيقي لقاعدة البيانات (SQLite)
 * ────────────────────────────────────────────────
 * GET    /api/settings/backup               → قائمة النسخ المحفوظة
 * GET    /api/settings/backup?download=name → تنزيل نسخة (attachment)
 * POST   /api/settings/backup               → إنشاء نسخة الآن (VACUUM INTO — لقطة متسقة)
 * DELETE /api/settings/backup?name=         → حذف نسخة
 * جميع العمليات للأدمن فقط (ADMIN).
 */

/** استخراج مسار ملف القاعدة من DATABASE_URL (يدعم المسار المطلق والنسبي) */
function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL || "file:./db/custom.db";
  const p = raw.startsWith("file:") ? raw.slice("file:".length).split("?")[0].trim() : raw;
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function backupsDir(): string {
  return path.join(path.dirname(resolveDbPath()), "backups");
}

/** أسماء مسموحة فقط — منع أي محاولة وصول لمسارات خارجية */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{3,120}\.db$/;
function assertSafeName(name: string): string {
  if (!name || !SAFE_NAME.test(name) || name.includes("..")) {
    throw new ApiError(400, "اسم ملف النسخة غير صالح");
  }
  if (!fs.existsSync(path.join(backupsDir(), name))) {
    throw new ApiError(404, "النسخة المطلوبة غير موجودة");
  }
  return path.join(backupsDir(), name);
}

/** قائمة النسخ + ملخص */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN"]);
    const url = new URL(req.url);
    const download = url.searchParams.get("download");

    if (download) {
      const filePath = assertSafeName(download);
      const buf = await fs.promises.readFile(filePath);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${download}"`,
          "Content-Length": String(buf.length),
        },
      });
    }

    const dir = backupsDir();
    if (!fs.existsSync(dir)) {
      return NextResponse.json({ items: [], count: 0, totalBytes: 0, dir });
    }
    const items = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".db"))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({
      items,
      count: items.length,
      totalBytes: items.reduce((s, i) => s + i.sizeBytes, 0),
      dir,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/** إنشاء نسخة احتياطية الآن — VACUUM INTO ينتج لقطة متسقة ومضغوطة */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const dir = backupsDir();
    fs.mkdirSync(dir, { recursive: true });

    // اسم فريد — حماية من التعارض
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").split(".")[0];
    let name = `pharmacy-backup-${stamp}.db`;
    let n = 1;
    while (fs.existsSync(path.join(dir, name))) {
      name = `pharmacy-backup-${stamp}-${n}.db`;
      n += 1;
    }
    const target = path.join(dir, name);

    // VACUUM INTO لا يقبل المعاملات المرتبطة — المسار يُبنى من الخادم فقط (لا مدخلات مستخدم)
    const esc = (s: string) => s.replace(/'/g, "''");
    await db.$queryRawUnsafe(`VACUUM INTO '${esc(target)}'`);

    const sizeBytes = fs.statSync(target).size;
    const settings = await db.settings.update({ where: { id: "main" }, data: { lastBackupAt: new Date() } }).catch(() => null);
    await logAudit({ userId: user.id, userName: user.fullName, action: "BACKUP_CREATE", entity: "Database", details: `إنشاء نسخة احتياطية: ${name} (${Math.round(sizeBytes / 1024)} KB)` });

    return NextResponse.json({ message: "تم إنشاء النسخة الاحتياطية بنجاح", name, sizeBytes, lastBackupAt: settings?.lastBackupAt ?? null }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

/** حذف نسخة احتياطية */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const name = new URL(req.url).searchParams.get("name") || "";
    const filePath = assertSafeName(name);
    fs.unlinkSync(filePath);
    await logAudit({ userId: user.id, userName: user.fullName, action: "BACKUP_DELETE", entity: "Database", details: `حذف نسخة احتياطية: ${name}` });
    return NextResponse.json({ message: "تم حذف النسخة" });
  } catch (e) {
    return handleApiError(e);
  }
}

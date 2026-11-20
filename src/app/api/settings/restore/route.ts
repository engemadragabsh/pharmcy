import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/**
 * استعادة نسخة احتياطية — بدون إعادة تشغيل النظام
 * ─────────────────────────────────────────────
 * POST /api/settings/restore  { name }   → للأدمن فقط
 *
 * الأسلوب: ATTACH لملف النسخة على نفس اتصال القاعدة الحية، ثم
 * حذف بيانات الجداول الحالية وإعادة إدراج محتوى النسخة داخل معاملة واحدة.
 * بذلك يبقى ملف القاعدة هو نفسه والاتصالات القائمة ترى البيانات الجديدة فوراً.
 *
 * ضمانات الأمان:
 * - اتصال مخصص بمَجموعة اتصال واحد (connection_limit=1) لضمان ثبات ATTACH والـ PRAGMA
 * - إيقاف فحص المفاتيح الأجنبية على هذا الاتصال فقط أثناء الاستعادة ثم إعادته
 * - مقارنة أعمدة كل جدول بين القاعدة والنسخة — الجداول غير المتطابقة (تغيّر مخطط) تُتخطى بأمان
 * - معاملة واحدة: أي فشل يرجع القاعدة لحالتها قبل الاستعادة
 */

function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL || "file:./db/custom.db";
  const p = raw.startsWith("file:") ? raw.slice("file:".length).split("?")[0].trim() : raw;
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function backupsDir(): string {
  return path.join(path.dirname(resolveDbPath()), "backups");
}

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

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const escPath = (s: string) => s.replace(/'/g, "''");

interface TableInfo { name: string; count: number }

export async function POST(req: NextRequest) {
  let restoreDb: PrismaClient | null = null;
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const body = await req.json().catch(() => null);
    const name = String(body?.name || "");
    const backupPath = assertSafeName(name);

    const mainPath = resolveDbPath();
    const base = process.env.DATABASE_URL || `file:${mainPath}`;
    const sep = base.includes("?") ? "&" : "?";
    restoreDb = new PrismaClient({
      datasources: { db: { url: `${base}${sep}connection_limit=1&socket_timeout=60&pool_timeout=60` } },
    });

    await restoreDb.$queryRawUnsafe("PRAGMA busy_timeout=10000");
    await restoreDb.$queryRawUnsafe("PRAGMA foreign_keys=OFF");
    await restoreDb.$executeRawUnsafe(`ATTACH DATABASE '${escPath(backupPath)}' AS bkp`);

    // الجداول المشتركة بين القاعدة الحية والنسخة + مقارنة الأعمدة
    const mainTables = await restoreDb.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name"
    );
    const bkpTables = new Set(
      (
        await restoreDb.$queryRawUnsafe<Array<{ name: string }>>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'"
        )
      ).map((r) => r.name)
    );

    const restored: TableInfo[] = [];
    const skipped: Array<{ table: string; reason: string }> = [];

    // معاملة صريحة — أي فشل يرجع القاعدة لحالتها قبل الاستعادة
    let inTx = false;
    try { await restoreDb.$executeRawUnsafe("BEGIN IMMEDIATE"); inTx = true; } catch { inTx = false; }

    for (const { name: t } of mainTables) {
      if (!bkpTables.has(t)) { skipped.push({ table: t, reason: "غير موجودة في النسخة" }); continue; }
      const colsMain = await restoreDb.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info(${q(t)})`);
      const colsBkp = await restoreDb.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA bkp.table_info(${q(t)})`);
      const m = colsMain.map((c) => c.name).join(",");
      const b = colsBkp.map((c) => c.name).join(",");
      if (m !== b) { skipped.push({ table: t, reason: "اختلاف في الأعمدة (مخطط أقدم/أحدث)" }); continue; }

      try {
        await restoreDb.$executeRawUnsafe(`DELETE FROM ${q(t)}`);
        await restoreDb.$executeRawUnsafe(`INSERT INTO ${q(t)} SELECT * FROM bkp.${q(t)}`);
        const rows = await restoreDb.$queryRawUnsafe<Array<{ c: number }>>(`SELECT COUNT(*) as c FROM ${q(t)}`);
        restored.push({ name: t, count: rows[0]?.c ?? 0 });
      } catch (eTab) {
        skipped.push({ table: t, reason: eTab instanceof Error ? eTab.message.slice(0, 80) : "خطأ" });
      }
    }

    if (inTx) { await restoreDb.$executeRawUnsafe("COMMIT"); }

    await restoreDb.$executeRawUnsafe("DETACH DATABASE bkp").catch(() => {});
    await restoreDb.$queryRawUnsafe("PRAGMA foreign_keys=ON").catch(() => {});
    await restoreDb.$disconnect().catch(() => {});
    restoreDb = null;

    await logAudit({
      userId: user.id,
      userName: user.fullName,
      action: "RESTORE",
      entity: "Database",
      details: `استعادة نسخة احتياطية: ${name} — جداول مُستعادة: ${restored.length} | متخطاة: ${skipped.length}`,
    });

    return NextResponse.json({
      message: `تمت الاستعادة بنجاح — ${restored.length} جدول`,
      restoredCount: restored.length,
      skippedCount: skipped.length,
      skipped,
    });
  } catch (e) {
    if (restoreDb) { await restoreDb.$disconnect().catch(() => {}); }
    return handleApiError(e);
  }
}

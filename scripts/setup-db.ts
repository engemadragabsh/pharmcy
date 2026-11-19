/**
 * scripts/setup-db.ts — منسّق تهيئة قاعدة البيانات التلقائية
 * ════════════════════════════════════════════════════════════════
 * يعمل عند كل إقلاع للتطبيق (idempotent — آمن أي عدد من المرات):
 *
 *   1) التأكد من وجود قاعدة البيانات
 *      SQLite: إنشاء المجلد والملف تلقائياً عند الحاجة
 *      مزودون لا يسمحون بالإنشاء البرمجي (Neon/Supabase/PlanetScale): تخطٍ بصمت
 *   2) التأكد من وجود الجداول (الـ Schema)
 *      توجد migrations → prisma migrate deploy
 *      لا توجد migrations → prisma db push --skip-generate
 *   3) البذر فقط إذا كانت القاعدة فارغة (عدّ User === 0)
 *
 * مصفوفة القرار:
 *   ❌ قاعدة مفقودة            → إنشاء + جداول + بذر
 *   ✅ موجودة / ❌ جداول مفقودة → جداول + بذر
 *   ✅ موجودة / ✅ جداول / فارغة → بذر فقط
 *   ✅ موجودة / ✅ جداول / بها بيانات → لا يفعل شيئاً
 *
 * كل خطوة داخل try/catch: أي فشل لا يمنع إقلاع التطبيق (تحذير فقط).
 * التشغيل المباشر: npm run setup:db — وأيضاً عبر instrumentation.ts تلقائياً.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { seedIfEmpty } from "../prisma/seed";

/** الجداول المحورية للتحقق من وجود الـ Schema */
const CORE_TABLES = ["User", "Branch", "Settings", "Product"];

const TAG = "[setup-db]";

/** مسار قاعدة SQLite الافتراضي داخل المشروع */
export function defaultDbUrl(): string {
  return `file:${path.join(process.cwd(), "db", "custom.db")}`;
}

/**
 * تحميل .env + تطبيعه — مع ضمان قابلية نقل المشروع لأي جهاز:
 *  - لا يوجد .env أو DATABASE_URL؟      → يُنشأ .env ويشير إلى db/custom.db داخل المشروع
 *  - المسار المُعد لا وجود له على هذا الجهاز؟ → يُعاد توجيهه إلى db/custom.db داخل المشروع
 *    (هكذا تنتقل قاعدة البيانات المعبأة مع المشروع وتعمل فوراً بدون أي إعداد يدوي)
 */
function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), ".env");
  const readEnv = (): Record<string, string> => {
    const out: Record<string, string> = {};
    try {
      if (!fs.existsSync(envPath)) return out;
      for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m) {
          let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          out[m[1]] = v;
        }
      }
    } catch { /* تجاهل — سنعتمد متغيرات البيئة الحالية */ }
    return out;
  };

  const fileEnv = readEnv();
  if (process.env.DATABASE_URL === undefined && fileEnv.DATABASE_URL) {
    process.env.DATABASE_URL = fileEnv.DATABASE_URL;
  }

  // ─── التطبيع لجهوزية النقل (SQLite فقط) ───
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("file:")) {
    const raw = url.slice("file:".length).split("?")[0].trim();
    if (raw && raw !== ":memory:" && !path.isAbsolute(raw)) {
      // مسار نسبي — نطلقه دائماً بالنسبة لجذر المشروع لتفادي اختلاف سياق التشغيل
      process.env.DATABASE_URL = `file:${path.resolve(process.cwd(), raw)}`;
    }
  }

  const configuredPath = process.env.DATABASE_URL?.startsWith("file:")
    ? process.env.DATABASE_URL.slice("file:".length).split("?")[0].trim()
    : "";

  if (!process.env.DATABASE_URL || (configuredPath && !fs.existsSync(configuredPath))) {
    const fallback = defaultDbUrl();
    const fallbackFile = fallback.slice("file:".length);
    if (!configuredPath || !fs.existsSync(fallbackFile)) {
      // لا يوجد إعداد صالح إطلاقاً — المشروع المنقول: ننشئ قاعدة جديدة داخل المشروع
      process.env.DATABASE_URL = fallback;
      try {
        fs.writeFileSync(envPath, `DATABASE_URL=${fallback}\n`, "utf8");
        console.log(`${TAG} 📝 تم إنشاء .env — DATABASE_URL=${fallback}`);
      } catch { /* لا يمكن الكتابة — نكمل بمتغير البيئة للعملية الحالية */ }
    } else {
      // قاعدة المشروع المرفقة موجودة — نعيد التوجيه إليها (نقل قاعدة معبأة)
      process.env.DATABASE_URL = fallback;
      try {
        const lines = fs.existsSync(envPath)
          ? fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter((l) => !/^\s*DATABASE_URL\s*=/.test(l) && l.trim() !== "")
          : [];
        lines.push(`DATABASE_URL=${fallback}`);
        fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
        console.log(`${TAG} 🔁 تم توجيه DATABASE_URL إلى قاعدة المشروع المرفقة: ${fallback}`);
      } catch { /* نكمل بمتغير البيئة للعملية الحالية */ }
    }
  }
}

// ─── الخطوة 1: التأكد من وجود قاعدة البيانات ───
export async function ensureDatabaseExists(): Promise<"created" | "exists" | "skipped"> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL غير معرّف — أضفه في ملف .env");
  const url = process.env.DATABASE_URL;

  // SQLite: إنشاء المجلد والملف برمجياً
  if (url.startsWith("file:")) {
    const raw = url.slice("file:".length).split("?")[0].trim();
    if (!raw || raw === ":memory:") return "skipped"; // قاعدة بالذاكرة — لا ملف
    const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "");
      console.log(`${TAG} 🗄️  تم إنشاء ملف قاعدة البيانات: ${filePath}`);
      return "created";
    }
    return "exists";
  }

  // مزودون آخرون (PostgreSQL مُدار مثل Neon/Supabase أو PlanetScale):
  // لا إنشاء برمجي — نتخطى بصمت ونفترض أن القاعدة موجودة مسبقاً.
  console.log(`${TAG} ℹ️  مزود قاعدة البيانات لا يسمح بالإنشاء البرمجي — افتراض أن القاعدة موجودة`);
  return "skipped";
}

// ─── التحقق من وجود الجداول المحورية ───
async function coreTablesExist(db: PrismaClient): Promise<boolean> {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) {
    const placeholders = CORE_TABLES.map(() => "?").join(",");
    const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`,
      ...CORE_TABLES
    );
    return rows.length >= CORE_TABLES.length;
  }
  // PostgreSQL / MySQL — أفضل جهد
  try {
    const inList = CORE_TABLES.map((t) => `'${t}'`).join(",");
    const rows = await db.$queryRawUnsafe<Array<{ table_name?: string; TABLE_NAME?: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_name IN (${inList})`
    );
    return rows.length >= CORE_TABLES.length;
  } catch {
    return false;
  }
}

// ─── الخطوة 2: التأكد من وجود الجداول ───
export async function ensureSchemaExists(db: PrismaClient): Promise<"exists" | "applied"> {
  if (await coreTablesExist(db)) return "exists";

  console.log(`${TAG} 📋 الجداول غير موجودة — تطبيق الـ Schema...`);
  const projectRoot = process.cwd();
  const bin = path.join(projectRoot, "node_modules", ".bin", "prisma");
  const migrationsDir = path.join(projectRoot, "prisma", "migrations");
  const hasMigrations = fs.existsSync(migrationsDir) && fs.readdirSync(migrationsDir).some((f) => !f.startsWith("."));

  // migrate deploy إذا توجد migrations، وإلا db push — وكلاهما آمن/idempotent
  const args = hasMigrations ? "migrate deploy" : "db push --skip-generate";
  const cmd = fs.existsSync(bin) ? `"${bin}" ${args}` : `npx prisma ${args}`;
  execSync(cmd, { cwd: projectRoot, stdio: "pipe", env: process.env });

  if (!(await coreTablesExist(db))) throw new Error("فشل إنشاء الجداول بعد تطبيق الـ Schema");
  console.log(`${TAG} ✅ تم تطبيق الـ Schema (${hasMigrations ? "migrate deploy" : "db push"})`);
  return "applied";
}

// ─── المنسّق الرئيسي ───
let running: Promise<void> | null = null;

async function run(source: string): Promise<void> {
  loadEnvFile();
  if (!process.env.DATABASE_URL) {
    console.warn(`${TAG} ⚠️  DATABASE_URL غير معرّف — تخطي التهيئة التلقائية`);
    return;
  }
  const db = new PrismaClient();
  try {
    console.log(`${TAG} 🚀 تهيئة قاعدة البيانات (المصدر: ${source})...`);
    // 1) القاعدة
    let s1 = "skipped", s2 = "skipped", s3 = false;
    try { s1 = await ensureDatabaseExists(); } catch (e) { console.warn(`${TAG} ⚠️  الخطوة 1 (إنشاء القاعدة): ${e instanceof Error ? e.message : e}`); }
    // 2) الجداول
    try { s2 = await ensureSchemaExists(db); } catch (e) { console.warn(`${TAG} ⚠️  الخطوة 2 (الجداول): ${e instanceof Error ? e.message : e}`); }
    // 3) البذر إن كانت فارغة
    try { s3 = await seedIfEmpty(db); } catch (e) { console.warn(`${TAG} ⚠️  الخطوة 3 (البذر): ${e instanceof Error ? e.message : e}`); }
    console.log(`${TAG} 🏁 اكتملت التهيئة — القاعدة: ${s1} | الجداول: ${s2} | البذر: ${s3 ? "تم على قاعدة فارغة" : "موجودة مسبقاً (لم يُمَس شيء)"}`);
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

/**
 * نقطة الدخول — آمنة للاستدعاء المتكرر (memoized) ولا ترمي أبداً:
 * أي فشل يُسجل كتحذير فقط ولا يمنع إقلاع التطبيق.
 */
export function bootstrapDatabase(source = "cli"): Promise<void> {
  if (running) return running;
  running = run(source).catch((e) => {
    console.warn(`${TAG} ⚠️  فشل التهيئة التلقائية — سيستمر إقلاع التطبيق: ${e instanceof Error ? e.message : e}`);
    running = null; // السماح بالمحاولة لاحقاً
  });
  return running;
}

// ─── التشغيل المباشر: npm run setup:db ───
const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invoked && import.meta.url === invoked) {
  bootstrapDatabase("cli").finally(() => process.exit(0));
}

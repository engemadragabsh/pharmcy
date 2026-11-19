/**
 * scripts/seed.ts — أداة إعادة التعيين اليدوية (للتطوير فقط!)
 * ─────────────────────────────────────────────────────────────
 * ⚠️ تحذف كل البيانات ثم تعيد البذر من جديد — لا تُستخدم في الإنتاج.
 *
 * مسار الإقلاع التلقائي الآمن (لا يحذف شيئاً) هو:
 *   • scripts/setup-db.ts  →  npm run setup:db
 *   • prisma/seed.ts       →  prisma db seed
 */
import { PrismaClient } from "@prisma/client";
import { resetDatabase, seedDatabase } from "../prisma/seed";

const db = new PrismaClient();

async function main() {
  console.log("🧨 إعادة تعيين كاملة لقاعدة البيانات (تطوير فقط)...");
  await resetDatabase(db);
  await seedDatabase(db);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

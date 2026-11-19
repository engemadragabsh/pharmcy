/**
 * Next.js Instrumentation — Auto Database Bootstrap
 * ─────────────────────────────────────────────────
 * register() يعمل مرة واحدة عند كل إقلاع للسيرفر (وليس لكل طلب)،
 * ويضمن: إنشاء القاعدة → إنشاء الجداول → البذر فقط إذا كانت فارغة.
 * آمن تماماً (Idempotent): التشغيل 100 مرة ينتج نفس حالة التشغيل مرة واحدة.
 * كل الفشل تُسجل كتحذيرات ولا تمنع إقلاع التطبيق إطلاقاً.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { bootstrapDatabase } = await import("../scripts/setup-db");
    await bootstrapDatabase("instrumentation");
  } catch (e) {
    console.warn(
      "[setup-db] ⚠️ فشل التهيئة التلقائية عند الإقلاع — سيستمر التطبيق في العمل:",
      e instanceof Error ? e.message : e
    );
  }
}

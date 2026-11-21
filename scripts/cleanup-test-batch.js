/**
 * تنظيف بيانات الاختبار — حذف تشغيلة TEST-RCV-01 وحركاتها وسجل التدقيق المرتبط
 */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const batches = await db.batch.findMany({ where: { batchNo: "TEST-RCV-01" } });
  for (const b of batches) {
    const mv = await db.stockMovement.deleteMany({ where: { batchId: b.id } });
    const au = await db.auditLog.deleteMany({ where: { entityId: b.id, action: "STOCK_RECEIVE" } });
    await db.batch.delete({ where: { id: b.id } });
    console.log(`حذفت تشغيلة ${b.batchNo} — حركات: ${mv.count} — تدقيق: ${au.count}`);
  }
  if (!batches.length) console.log("لا توجد بيانات اختبار");
  const left = await db.batch.count({ where: { batchNo: "TEST-RCV-01" } });
  console.log("المتبقي بعد الحذف:", left);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

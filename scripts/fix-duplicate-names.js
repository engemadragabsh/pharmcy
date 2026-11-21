/**
 * fix-duplicate-names.js — إصلاح 10 أسماء مكررة بعد تعبئة الكتالوج
 * 1) مركب دايوستين (Diosmin + Hesperidin) كان مسمى باسم العلامة التجارية دايفلون → يُعاد تسميته باسمه العلمي
 * 2) علامات تجارية تطابق أصناف seed قديمة → إضافة حجم العبوة لاسم الصنف الجديد
 */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  // 1) دايفلون (مركب) → دايوستين
  const dio = await db.product.findMany({
    where: { tradeName: { startsWith: "دايفلون" }, scientificName: "Diosmin + Hesperidin" },
  });
  for (const p of dio) {
    const newName = p.tradeName.replace("دايفلون", "دايوستين");
    await db.product.update({ where: { id: p.id }, data: { tradeName: newName, tradeNameEn: "Diosmin + Hesperidin" } });
    console.log("✓", p.tradeName, "→", newName);
  }

  // 2) تعارض مع أصناف seed القديمة → إلحاق حجم العبوة بالأسماء الجديدة
  const collisions = ["أوجمنتين 1 جم", "زينات 500 مجم", "فولتارين 50 مجم", "كونكور 5 مجم", "أملور 5 مجم", "جلوكوفاج 1000 مجم"];
  for (const name of collisions) {
    const rows = await db.product.findMany({
      where: { tradeName: name, barcode: { startsWith: "62210482" } },
    });
    for (const p of rows) {
      const newName = `${p.tradeName} — ${p.packSize || "علبة"}`;
      await db.product.update({ where: { id: p.id }, data: { tradeName: newName } });
      console.log("✓", p.tradeName, "→", newName);
    }
  }

  // تحقق نهائي
  const ps = await db.product.findMany({ select: { tradeName: true } });
  const names = ps.map((p) => p.tradeName);
  console.log("أسماء فريدة:", new Set(names).size, "من", names.length);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

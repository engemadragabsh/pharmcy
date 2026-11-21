/**
 * migrate-multi-uom.js — تهجير قائمة إلى Multi-UoM
 * إنشاء صف الوحدة الأساسية (ProductUnit) لكل صنف من وحدة الصنف الحالية
 * factor = 1 + isBase + isDefault — لا يغيّر أي كمية أو سعر قائم
 * آمن على إعادة التشغيل (يتخطى الأصناف التي لها وحدات بالفعل)
 */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const products = await db.product.findMany({
    select: { id: true, unitId: true, sellPrice: true, wholesalePrice: true, _count: { select: { units: true } } },
  });
  const units = await db.unitOfMeasure.findMany();
  const unitById = new Map(units.map((u) => [u.id, u]));

  const targets = products.filter((p) => p._count.units === 0);
  console.log(`الأصناف: ${products.length} — بحاجة لصف وحدة أساسية: ${targets.length}`);

  let created = 0;
  const CHUNK = 300;
  const rows = targets.map((p) => {
    const u = p.unitId ? unitById.get(p.unitId) : null;
    return {
      productId: p.id,
      unitId: p.unitId,
      unitName: u?.name || "وحدة",
      unitNameEn: u?.nameEn || "Unit",
      factor: 1,
      sellPrice: p.sellPrice,
      wholesalePrice: p.wholesalePrice,
      isBase: true,
      isDefault: true,
    };
  });
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.productUnit.createMany({ data: rows.slice(i, i + CHUNK) });
    created += Math.min(CHUNK, rows.length - i);
    process.stdout.write(`\r⏳ ${created}/${rows.length}`);
  }
  console.log("");
  const total = await db.productUnit.count();
  const withBase = await db.productUnit.count({ where: { isBase: true } });
  console.log(`✅ صفوف وحدات البيع: ${total} — وحدات أساسية: ${withBase} / أصناف: ${await db.product.count()}`);
}

main()
  .catch((e) => { console.error("❌ فشل:", e); process.exit(1); })
  .finally(() => db.$disconnect());

/**
 * add-sale-units.js — تفعيل Multi-UoM الحقيقي على الكتالوج
 * ════════════════════════════════════════════════════════════════
 * لكل صنف له وحدة أساسية واحدة فقط، نشتق من الاسم:
 *   «علبة شريطين»      → علبة (أساسي) + شريط (عامل ½) + قرص (عامل 1/20)
 *   «علبة 3 شرائط»     → علبة + شريط (1/3) + قرص (1/30)
 *   «20 قرص»           → علبة (أساسي، يُعاد تسميتها) + قرص (1/20)
 *   «20 كبسولة»        → علبة + كبسولة (1/20)
 *   «شريط 7»           → شريط (أساسي) + قرص (1/7)
 *   «شريط 10 أقراص»    → شريط (أساسي) + قرص (1/10)
 *   «شريط» بلا رقم     → شريط (أساسي) + قرص (1/10 — النمط القياسي في الكتالوج)
 *
 * الاصطلاح: العامل = عدد الوحدات الأساسية (كما تُخزّن الباتشات) داخل وحدة واحدة من الصف.
 * الوحدة الأساسية = العلبة (factor 1) لأن المخزون مُستلم بالعلب — الشريط/القرص كسور من العلبة.
 * الأسعار لكل وحدة = سعر الأساسي × العامل (مقرّب لخانتين).
 * آمن على إعادة التشغيل: يتخطى الأصناف التي لها أكثر من وحدة.
 */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const AR_DIGITS = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const norm = (s) => String(s || "").replace(/[٠-٩]/g, (d) => AR_DIGITS[d] || d);
const round2 = (x) => Math.round(x * 100) / 100;

/** استخراج معلومات العبوة من اسم الصنف */
function parsePack(name, baseUnitName) {
  const n = norm(name);
  const base = norm(baseUnitName);

  // صنف شريط كوحدة أساسية: «شريط 7»، «شريط 10 أقراص»، «شريط»
  if (base === "شريط") {
    const m = n.match(/شريط\s*(\d+)/);
    const sub = /كبسولة/.test(n) ? "كبسولة" : "قرص";
    return { kind: "strip", count: m ? Number(m[1]) : 10, sub, renameBase: null, baseUnitId: "strip" };
  }

  // عبوات شرائط: «علبة شريطين»، «علبة 3 شرائط»
  let m = n.match(/علبة\s*شريطين/);
  if (m) return { kind: "pack-strips", count: 2, sub: "قرص", renameBase: "علبة", baseUnitId: "box" };
  m = n.match(/علبة\s*(\d+)\s*شرائط/);
  if (m) return { kind: "pack-strips", count: Number(m[1]), sub: "قرص", renameBase: "علبة", baseUnitId: "box" };

  // عبوات عدد مباشر: «20 قرص»، «10 أقراص»، «20 كبسولة»
  m = n.match(/(\d+)\s*(كبسولة|أقراص|قرص)/);
  if (m) {
    const sub = m[2] === "كبسولة" ? "كبسولة" : "قرص";
    return { kind: "pack-count", count: Number(m[1]), sub, renameBase: "علبة", baseUnitId: "box" };
  }

  // قاعدة قياسية للأدوية الصلبة بلا معلومة عبوة في الاسم («بانادول إكسترا 500 مجم»):
  // أشكال صيدلانية صلبة (مجم/جم/مج) بلا مؤشر سائل أو موضعي → علبة 2 شريط × 10 (النمط السائد)
  const LIQUID = /شراب|بخاخ|كريم|مرهم|جيل|جِيل|أنبوب|انبوب|زجاجة|قطرة|تحميلة|تحاميل|لبوس|فوارة|سبراي|أوسمنت|اوسمنت|محلول|شامبو|غسول/;
  const SOLID = /مجم|مcg|ميكروجرام|أقراص|قرص|كبسولة/;
  if (!LIQUID.test(n) && SOLID.test(n)) {
    return { kind: "pack-strips", count: 2, sub: "قرص", renameBase: "علبة", baseUnitId: "box" };
  }

  return null; // شراب/بخاخ/كريم… — يبقى بوحدة أساسية واحدة
}

async function main() {
  const masters = await db.unitOfMeasure.findMany();
  const masterByName = new Map(masters.map((u) => [u.name, u.id]));

  const products = await db.product.findMany({
    select: { id: true, tradeName: true, sellPrice: true, wholesalePrice: true, units: true },
  });
  const targets = products.filter((p) => p.units.length === 1);
  console.log(`الأصناف: ${products.length} — قابلة للاشتقاق (وحدة واحدة): ${targets.length}`);

  let boxes = 0, strips = 0, subs = 0, renamed = 0;
  const skippedNames = { pack: 0, strip: 0 };
  const CHUNK = 250;
  let buffer = [];

  for (const p of targets) {
    const base = p.units[0];
    const info = parsePack(p.tradeName, base.unitName);
    if (!info) continue;

    if (info.kind === "pack-strips") {
      // شريط: 1 شريط = (1/عدد الشرائط) علبة
      const stripFactor = round2(1 / info.count);
      const subFactor = round2(1 / (info.count * 10)); // الشريط القياسي = 10 أقراص/كبسولات (نمط الكتالوج نفسه)
      buffer.push({
        productId: p.id,
        unitId: masterByName.get("شريط") || null,
        unitName: "شريط",
        unitNameEn: "Strip",
        factor: stripFactor,
        sellPrice: round2((p.sellPrice || 0) * stripFactor),
        wholesalePrice: p.wholesalePrice != null ? round2(p.wholesalePrice * stripFactor) : null,
        isBase: false,
        isDefault: false,
      });
      buffer.push({
        productId: p.id,
        unitId: null,
        unitName: info.sub,
        unitNameEn: info.sub === "كبسولة" ? "Capsule" : "Tablet",
        factor: subFactor,
        sellPrice: round2((p.sellPrice || 0) * subFactor),
        wholesalePrice: p.wholesalePrice != null ? round2(p.wholesalePrice * subFactor) : null,
        isBase: false,
        isDefault: false,
      });
      strips++; subs++;
      skippedNames.pack++;
    } else if (info.kind === "pack-count") {
      // قرص/كبسولة: 1 = (1/العدد) علبة
      const subFactor = round2(1 / info.count);
      buffer.push({
        productId: p.id,
        unitId: null,
        unitName: info.sub,
        unitNameEn: info.sub === "كبسولة" ? "Capsule" : "Tablet",
        factor: subFactor,
        sellPrice: round2((p.sellPrice || 0) * subFactor),
        wholesalePrice: p.wholesalePrice != null ? round2(p.wholesalePrice * subFactor) : null,
        isBase: false,
        isDefault: false,
      });
      subs++;
      skippedNames.pack++;
    } else if (info.kind === "strip") {
      // قرص داخل الشريط: 1 قرص = (1/العدد) شريط
      const subFactor = round2(1 / info.count);
      buffer.push({
        productId: p.id,
        unitId: null,
        unitName: info.sub,
        unitNameEn: info.sub === "كبسولة" ? "Capsule" : "Tablet",
        factor: subFactor,
        sellPrice: round2((p.sellPrice || 0) * subFactor),
        wholesalePrice: p.wholesalePrice != null ? round2(p.wholesalePrice * subFactor) : null,
        isBase: false,
        isDefault: false,
      });
      subs++;
      skippedNames.strip++;
    }

    // إعادة تسمية الوحدة الأساسية العامة «وحدة» إلى الاسم الحقيقي + ربط الـ master
    if (info.renameBase && base.unitName === "وحدة") {
      await db.productUnit.update({
        where: { id: base.id },
        data: { unitName: info.renameBase, unitNameEn: "Box", unitId: masterByName.get(info.renameBase) || base.unitId },
      });
      renamed++;
    } else if (info.baseUnitId === "strip" && base.unitId == null) {
      await db.productUnit.update({ where: { id: base.id }, data: { unitId: masterByName.get("شريط") || null } });
    }

    if (buffer.length >= CHUNK) {
      await db.productUnit.createMany({ data: buffer });
      buffer = [];
    }
  }
  if (buffer.length) await db.productUnit.createMany({ data: buffer });

  const totalUnits = await db.productUnit.count();
  const multi = await db.$queryRawUnsafe(`SELECT COUNT(*) c FROM (SELECT productId FROM ProductUnit GROUP BY productId HAVING COUNT(*) > 1)`);

  console.log(`✅ عبوات شرائط (+شريط+قرص): ${strips}`);
  console.log(`✅ عبوات عدد مباشر (+${"وحدة فرعية"}): ${subs}`);
  console.log(`✅ وحدات أساسية أُعيدت تسميتها إلى «علبة»: ${renamed}`);
  console.log(`📊 إجمالي صفوف الوحدات: ${totalUnits} — أصناف متعددة الوحدات: ${multi[0].c}`);
}

main()
  .catch((e) => { console.error("❌ فشل:", e); process.exit(1); })
  .finally(() => db.$disconnect());

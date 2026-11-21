/**
 * seed-catalog-5000.mjs — تعبئة القاعدة بكتالوج منتجات كامل ليصل الإجمالي إلى 5000 صنف
 * ════════════════════════════════════════════════════════════════════════════
 *  • يعتمد على البيانات الموجودة (لا يحذف ولا يعدل أصنافاً قائمة)
 *  • إضافة شركات/أشكال صيدلانية/وحدات/مواد فعالة جديدة (upsert — بدون حذف)
 *  • باركود EAN-13 سليم ببادئة مصر 622 وبادئة الشركة 1048 نفس نمط الأصناف الموجودة
 *  • الأسعار في نطاقات السوق المصري 2026 حسب الصنف الدوائي
 *  • لا ينشئ مخزوناً وهمياً — الرصيد يُستقبل فعلياً عبر «استلام بضاعة»
 *  • آمن على إعادة التشغيل: يتوقف إن كان الإجمالي 5000 أو أكثر
 */
import { PrismaClient } from "@prisma/client";
import { MOLECULES_A } from "./catalog/molecules-a.mjs";
import { MOLECULES_B } from "./catalog/molecules-b.mjs";
import { MOLECULES_C } from "./catalog/molecules-c.mjs";
import { BRANDS } from "./catalog/brands.mjs";
import { CONSUMER_A } from "./catalog/consumer-a.mjs";
import { CONSUMER_B } from "./catalog/consumer-b.mjs";
import { CONSUMER_C } from "./catalog/consumer-c.mjs";
import { CONSUMER_D } from "./catalog/consumer-d.mjs";

const db = new PrismaClient();
const TARGET_TOTAL = Number(process.env.TARGET_TOTAL || 5000);

/** مولد أرقام عشوائية حتمي (نفس النتيجة كل تشغيل) */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261121);
const pick = (min, max) => min + rnd() * (max - min);

// ═══════════════ تعريفات ثابتة ═══════════════

const NEW_MANUFACTURERS = {
  abbott: ["أبوت", "Abbott", "الولايات المتحدة"],
  pfizer: ["بفايزر", "Pfizer", "الولايات المتحدة"],
  msd: ["إم إس دي", "MSD", "الولايات المتحدة"],
  bayer: ["باير", "Bayer", "ألمانيا"],
  boehringer: ["بوهرنجر إنجلهايم", "Boehringer Ingelheim", "ألمانيا"],
  az: ["أسترا زينكا", "AstraZeneca", "المملكة المتحدة"],
  merck: ["ميرك", "Merck KGaA", "ألمانيا"],
  nn: ["نوفو نورديسك", "Novo Nordisk", "الدنمارك"],
  jnj: ["جونسون آند جونسون", "Johnson & Johnson", "الولايات المتحدة"],
  reckitt: ["ريكت", "Reckitt", "المملكة المتحدة"],
  roche: ["روش", "Roche", "سويسرا"],
  leo: ["ليو فارما", "LEO Pharma", "الدنمارك"],
  alcon: ["ألكون", "Alcon", "سويسرا"],
  servier: ["سيرفييه", "Servier", "فرنسا"],
  ucb: ["يو سي بي", "UCB", "بلجيكا"],
  october: ["أكتوبر فارما", "October Pharma", "مصر"],
  mup: ["الميديكال يونيون", "Medical Union Pharmaceuticals", "مصر"],
  eva: ["إيفا فارما", "EVA Pharma", "مصر"],
  unilever: ["يونيليفر", "Unilever", "المملكة المتحدة"],
  pg: ["بروكتر آند جامبل", "Procter & Gamble", "الولايات المتحدة"],
  loreal: ["لوريال", "L'Oréal", "فرنسا"],
  beiersdorf: ["بيرسدورف", "Beiersdorf", "ألمانيا"],
  colgate: ["كولجيت بالمولايف", "Colgate-Palmolive", "الولايات المتحدة"],
  clorox: ["كلوروكس", "Clorox", "الولايات المتحدة"],
  kimberly: ["كيمبرلي كلارك", "Kimberly-Clark", "الولايات المتحدة"],
  henkel: ["هنكل", "Henkel", "ألمانيا"],
  nestle: ["نستله", "Nestlé", "سويسرا"],
  danone: ["دانون", "Danone", "فرنسا"],
  ontex: ["أونتكس", "Ontex", "بلجيكا"],
  fine: ["فاين هايجينيك", "Fine Hygienic Holding", "الإمارات"],
  omron: ["أومرون", "Omron", "اليابان"],
  vitabiotics: ["فيتابيوتكس", "Vitabiotics", "المملكة المتحدة"],
  bioderma: ["بيوديرما", "Bioderma", "فرنسا"],
  avene: ["أفين", "Avène", "فرنسا"],
};
const EXISTING_MANUFACTURERS = {
  gsk: "GSK مصر", novartis: "نوفارتس", sanofi: "سانوفى", hikma: "هيكما للأدوية",
  eipico: "إيبكو", amoun: "أمون", pharco: "فاركو", sigma: "سيجما للأدوية", globalnapi: "جلوبال نابي",
};

const FORMS = {
  TAB: ["أقراص", "Tablets"], TABF: ["أقراص مكسوة", "Film-coated Tablets"], CAP: ["كبسولات", "Capsules"],
  CHEW: ["أقراص مضغ", "Chewable Tablets"], EFF: ["أقراص فوار", "Effervescent Tablets"],
  SYR: ["شراب", "Syrup"], SUS: ["معلق", "Suspension"], DROPS: ["قطرات", "Drops"],
  SPRAY: ["بخاخ", "Spray"], INH: ["بخاخ استنشاق", "Inhaler"], INJ: ["حقن", "Injection"],
  CREAM: ["كريم", "Cream"], OINT: ["مرهم", "Ointment"], GEL: ["جل", "Gel"],
  SUP: ["تحاميل", "Suppository"], SACH: ["أكياس", "Sachets"], SOL: ["غسول", "Solution"],
  SHAM: ["شامبو", "Shampoo"], LOT: ["لوشن", "Lotion"], PEN: ["قلم حقن", "Injection Pen"],
};
/** اللاحقة الاسمية لكل شكل + كلمة في العبوة */
const FORM_WORD = { DROPS: "قطرات", SPRAY: "بخاخ", CREAM: "كريم", OINT: "مرهم", GEL: "جل", SUP: "تحاميل", INJ: "أمبولات", SUS: "معلق", SYR: "شراب", SACH: "أكياس", SOL: "غسول", SHAM: "شامبو", LOT: "لوشن", EFF: "فوار", PEN: "قلم", INH: "بخاخ" };
const PACKS = {
  TAB: ["20 قرص", "30 قرص", "50 قرص", "100 قرص", "علبة شريطين", "علبة 3 شرائط", "علبة 4 شرائط"],
  TABF: ["20 قرص", "30 قرص", "50 قرص", "100 قرص", "علبة شريطين", "علبة 3 شرائط", "علبة 4 شرائط"],
  CAP: ["20 كبسولة", "30 كبسولة", "100 كبسولة", "علبة شريطين", "علبة 3 شرائط"], CHEW: ["10 أقراص", "20 قرص", "30 قرص"],
  EFF: ["10 أقراص", "20 قرص"], SYR: ["زجاجة 60 مل", "زجاجة 100 مل", "زجاجة 120 مل", "زجاجة 200 مل"],
  SUS: ["زجاجة 60 مل", "زجاجة 100 مل", "زجاجة 120 مل", "زجاجة 200 مل"], DROPS: ["زجاجة 5 مل", "زجاجة 10 مل", "زجاجة 15 مل"],
  SPRAY: ["زجاجة 10 مل", "زجاجة 15 مل", "زجاجة 20 مل"], INH: ["بخاخ 200 جرعة"], INJ: ["أمبولة واحدة", "5 أمبولات", "10 أمبولات"],
  CREAM: ["أنبوب 15 جم", "أنبوب 20 جم", "أنبوب 30 جم", "أنبوب 50 جم"], OINT: ["أنبوب 15 جم", "أنبوب 20 جم", "أنبوب 30 جم", "أنبوب 50 جم"],
  GEL: ["أنبوب 15 جم", "أنبوب 20 جم", "أنبوب 30 جم", "أنبوب 50 جم"], SUP: ["5 تحاميل", "10 تحاميل", "20 تحاميل"],
  SACH: ["10 أكياس", "20 كيس", "30 كيس"], SOL: ["زجاجة 120 مل", "زجاجة 250 مل", "زجاجة 500 مل", "زجاجة 1000 مل"],
  SHAM: ["زجاجة 100 مل", "زجاجة 200 مل", "زجاجة 400 مل"], LOT: ["زجاجة 60 مل", "زجاجة 100 مل", "زجاجة 200 مل"],
  PEN: ["قلم واحد", "علبة 5 أقلام"],
};
const INITIAL_PACKS = { TAB: 2, TABF: 2, CAP: 2, CHEW: 2, DROPS: 2, INJ: 2, CREAM: 2, OINT: 2, GEL: 2 };
const FORM_UNIT = { TAB: "علبة", TABF: "علبة", CAP: "علبة", CHEW: "علبة", EFF: "علبة", SYR: "زجاجة", SUS: "زجاجة", DROPS: "زجاجة", SPRAY: "زجاجة", INH: "علبة", INJ: "علبة", CREAM: "أنبوب", OINT: "أنبوب", GEL: "أنبوب", SUP: "علبة", SACH: "كيس", SOL: "زجاجة", SHAM: "زجاجة", LOT: "زجاجة", PEN: "علبة" };
const FORM_FACTOR = { INH: 2.0, PEN: 3.0, INJ: 1.4, SUP: 0.8, EFF: 1.2, SUS: 0.9, SYR: 0.9, SHAM: 1.3, SOL: 1.1 };

/** نطاق سعر البيع + التصنيف لكل صنف دوائي */
const CLASS = {
  pain: [12, 45, false], muscle: [30, 70, true], nsaid: [25, 80, false],
  "ab-pen": [55, 150, true], "ab-ceph": [70, 240, true], "ab-mac": [90, 260, true],
  "ab-quin": [70, 200, true], "ab-other": [55, 180, true], "antiF-tab": [60, 170, true],
  "antiF-top": [35, 90, false], antiV: [80, 240, true], helm: [12, 45, false],
  antihist: [12, 45, false], resp: [50, 180, false], ppi: [45, 150, false],
  gi: [30, 110, false], antiEm: [25, 80, false], lax: [30, 110, false],
  cardio: [45, 160, true], cardioCombo: [90, 220, true], diuretic: [28, 80, true],
  statin: [80, 240, true], fibrate: [65, 130, true], "dm-oral": [45, 200, true],
  "dm-ins": [230, 460, true], anticoag: [90, 280, true], "neuro-ae": [60, 220, true],
  "neuro-ssri": [55, 180, true], "neuro-psy": [60, 200, true], "neuro-pain": [80, 220, true],
  "neuro-park": [50, 150, true], "neuro-mig": [70, 160, true], "neuro-other": [40, 120, false],
  vertigo: [35, 90, false], thyroid: [40, 110, true], hormone: [45, 160, true],
  uro: [55, 150, true], ophthaRx: [40, 130, true], ophtha: [35, 90, false],
  derm: [28, 85, false], "derm-acne": [45, 140, false], iso: [100, 240, true],
  misc: [30, 110, true], misc2: [50, 160, true], supp: [30, 260, false],
  "dm-glp": [2200, 3800, true],
};
const ZONE = { RX: "B", OTC: "A", COSMETIC: "D", FOOD: "E", MEDICAL_SUPPLY: "F" };

function ean13CheckDigit(d12) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10;
}
const round2 = (n) => Math.round(n * 2) / 2;

// ═══════════════ البرنامج ═══════════════
async function main() {
  const existingCount = await db.product.count();
  const target = TARGET_TOTAL;
  const needed = target - existingCount;
  console.log(`📊 الأصناف الحالية: ${existingCount} — المطلوب إضافته: ${needed}`);
  if (needed <= 0) { console.log("✅ القاعدة مكتملة بالفعل — لا فعل شيء"); return; }

  // 1) جلب/إنشاء الجداول المرجعية
  const mfgRows = await db.manufacturer.findMany();
  const mfgByArName = new Map(mfgRows.map((m) => [m.name, m.id]));
  for (const [ar, en, country] of Object.values(NEW_MANUFACTURERS)) {
    if (!mfgByArName.has(ar)) {
      const m = await db.manufacturer.create({ data: { name: ar, nameEn: en, country } });
      mfgByArName.set(ar, m.id);
    }
  }
  const mfgId = (key) => {
    if (key == null) return null;
    const ar = EXISTING_MANUFACTURERS[key] || (NEW_MANUFACTURERS[key] ? NEW_MANUFACTURERS[key][0] : null);
    return ar ? (mfgByArName.get(ar) || null) : null;
  };

  const formRows = await db.dosageForm.findMany();
  const formByEn = new Map(formRows.map((f) => [f.nameEn, f.id]));
  for (const [en, [ar]] of Object.entries(FORMS)) {
    const f = await db.dosageForm.upsert({ where: { name: ar }, update: { nameEn: en }, create: { name: ar, nameEn: en } });
    formByEn.set(en, f.id);
  }
  const unitRows = await db.unitOfMeasure.findMany();
  const unitByEn = new Map(unitRows.map((u) => [u.nameEn, u.id]));
  const NEW_UNITS = { Sachet: "كيس", "Injection Pen": "قلم حقن" };
  for (const [en, ar] of Object.entries(NEW_UNITS)) {
    const u = await db.unitOfMeasure.upsert({ where: { name: ar }, update: { nameEn: en }, create: { name: ar, nameEn: en } });
    unitByEn.set(en, u.id);
  }
  const unitId = (en) => unitByEn.get(en) || null;

  // 2) المواد الفعالة (upsert بالاسم العربي)
  const ingPairs = new Set();
  for (const m of [...MOLECULES_A, ...MOLECULES_B]) ingPairs.add(`${m[0]}||${m[1]}`);
  for (const b of BRANDS) ingPairs.add(`${b[2]}||${b[3]}`);
  const ingIdByKey = new Map();
  for (const key of ingPairs) {
    const [ar, en] = key.split("||");
    if (!ar || ar.includes("مادة فعالة أخرى")) continue;
    const row = await db.activeIngredient.upsert({ where: { name: ar }, update: {}, create: { name: ar, nameEn: en } });
    ingIdByKey.set(key, row.id);
  }

  // 3) بناء مجموعات الأصناف
  const combos = []; // {group, ar, en, sci, ingId, formKey, conc, packsUsed, mfg, origin, cat, rx, buy, sell, notes}
  let seqBrand = 0, seqMol = 0;

  for (const [bAr, bEn, ingAr, ingEn, mfgKey, origin, rx, variants] of BRANDS) {
    const sci = ingEn === "Other" ? null : ingEn;
    const ingId = ingEn === "Other" ? null : (ingIdByKey.get(`${ingAr}||${ingEn}`) || null);
    for (const [conc, formKey, buy, sell] of variants) {
      const name = `${bAr} ${conc}`;
      combos.push({
        group: "brand", name, te: bEn, sci, ingId,
        formKey: formKey === "NONE" ? null : formKey,
        conc: formKey === "NONE" ? null : conc,
        pack: formKey === "NONE" ? null : (PACKS[formKey] ? PACKS[formKey][0] : null),
        packsUsed: 0, noExpand: true,
        mfg: mfgId(mfgKey), origin, cat: rx ? "RX" : "OTC", rx,
        buy, sell, notes: null, _i: seqBrand++,
      });
    }
  }

  for (const m of [...MOLECULES_A, ...MOLECULES_B, ...MOLECULES_C]) {
    const [ar, en, cls, variants] = m;
    if (!variants || variants.length === 0) continue;
    const [lo, hi, rx] = CLASS[cls] || [40, 120, false];
    const ingId = ingIdByKey.get(`${ar}||${en}`) || null;
    variants.forEach(([conc, formKey], vi) => {
      if (formKey === "NONE") {
        combos.push({
          group: "molecule", name: `${ar} ${conc}`, te: en, sci: en, ingId,
          formKey: null, conc, pack: null, packsUsed: 0, noExpand: true, strip: false,
          mfg: null, origin: null, cat: rx ? "RX" : "OTC", rx,
          buy: round2(lo * 0.8), sell: Math.round(lo), notes: null, _i: seqMol++,
        });
        return;
      }
      if (!PACKS[formKey]) return;
      const word = FORM_WORD[formKey] ? ` ${FORM_WORD[formKey]}` : "";
      const factor = (1 + vi * 0.08) * (FORM_FACTOR[formKey] || 1);
      const baseSell = (lo + rnd() * (hi - lo)) * factor;
      const sell = Math.max(6, Math.round(baseSell));
      const buy = round2(sell * (0.74 + rnd() * 0.08));
      combos.push({
        group: "molecule", name: `${ar} ${conc}${word}`, te: en, sci: en, ingId,
        formKey, conc, pack: null, packsUsed: 0, noExpand: false, strip: false,
        mfg: null, origin: null, cat: rx ? "RX" : "OTC", rx,
        buy, sell, notes: cls === "iso" ? "يمنع استخدامه أثناء الحمل — يُصرف بوصفة طبية فقط" : null, _i: seqMol++,
      });
    });
  }

  // شرائط الصرف — كل صنف أقراص/كبسولات (مركبات وعلامات) يُصرف أيضاً بالشريط كما في الصيدليات
  // + شريط 7 أقراص للتشغيلات (نمط شائع للمضادات الحيوية)
  const stripSKUs = [];
  for (const c of combos.filter((x) => !x.strip && x.formKey && ["TAB", "TABF", "CAP"].includes(x.formKey))) {
    const unitWord = c.formKey === "CAP" ? "شريط 10 كبسولات" : "شريط 10 أقراص";
    stripSKUs.push({
      ...c,
      name: `${c.name} شريط`,
      pack: unitWord,
      strip: true,
      noExpand: true,
      sell: Math.max(5, Math.round(c.sell * 0.32)),
      buy: round2(c.buy * 0.3),
    });
    if (c.formKey !== "CAP") {
      stripSKUs.push({
        ...c,
        name: `${c.name} — شريط 7`,
        pack: "شريط 7 أقراص",
        strip: true,
        noExpand: true,
        sell: Math.max(5, Math.round(c.sell * 0.24)),
        buy: round2(c.buy * 0.22),
      });
    }
  }
  // عبوة مزدوجة للعلامات التجارية على شكل أقراص (مثل بانادول إكسترا 48 قرص)
  const brandDouble = [];
  for (const c of combos.filter((x) => x.group === "brand" && !x.strip && ["TAB", "TABF", "CAP"].includes(x.formKey) && x.formKey)) {
    brandDouble.push({
      ...c,
      name: `${c.name} — علبة شريطين`,
      pack: c.formKey === "CAP" ? "علبة شريطين" : "علبة شريطين",
      strip: false,
      noExpand: true,
      sell: Math.round(c.sell * 1.9),
      buy: round2(c.buy * 1.88),
    });
  }
  combos.push(...stripSKUs, ...brandDouble);

  for (const [ar, en, mfgKey, cat, buy, sell] of [...CONSUMER_A, ...CONSUMER_B, ...CONSUMER_C, ...CONSUMER_D]) {
    combos.push({
      group: "consumer", name: ar, te: en, sci: null, ingId: null,
      formKey: null, conc: null, pack: null, packsUsed: 0, noExpand: true,
      mfg: mfgId(mfgKey), origin: null, cat, rx: false,
      buy, sell, notes: null, _i: 0,
    });
  }

  // 4) التشابك الدائري بين المجموعات لضمان توزيع متوازن
  const groups = {
    brand: combos.filter((c) => c.group === "brand"),
    molecule: combos.filter((c) => c.group === "molecule"),
    consumer: combos.filter((c) => c.group === "consumer"),
  };
  const merged = [];
  const cursors = { brand: 0, molecule: 0, consumer: 0 };
  const order = ["molecule", "brand", "consumer"];
  while (cursors.brand < groups.brand.length || cursors.molecule < groups.molecule.length || cursors.consumer < groups.consumer.length) {
    for (const g of order) {
      if (cursors[g] < groups[g].length) merged.push(groups[g][cursors[g]++]);
    }
  }

  // 5) ملء الفجوة بزيادة أحجام العبوات (أحجام حقيقية في السوق) — مع مخزون احتياطي لاستبدال الأسماء المتكررة
  let base = [...merged];
  const extra = [];
  let pass = 0;
  const POOL_TARGET = needed + 200;
  while (base.length + extra.length < POOL_TARGET && pass < 12) {
    let addedThisPass = 0;
    for (const c of base) {
      if (base.length + extra.length >= POOL_TARGET) break;
      if (c.noExpand || !c.formKey) continue;
      const all = PACKS[c.formKey] || [];
      const nextIdx = c.packsUsed;
      if (nextIdx >= all.length) continue;
      c.packsUsed += 1;
      addedThisPass++;
      const factor = 1 + nextIdx * 0.12;
      extra.push({
        ...c,
        name: `${c.name} — ${all[nextIdx]}`,
        pack: all[nextIdx],
        sell: Math.max(6, Math.round(c.sell * factor)),
        buy: round2(c.buy * factor),
      });
    }
    if (addedThisPass === 0) break;
    pass++;
  }
  const pool = [...base, ...extra];

  // 6) منع إضافة صنف موجود بالاسم — توحيد الهمزات والمسافات ثم المقارنة مع أسماء القاعدة الحالية
  const normName = (s) => String(s || "").trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ـ/g, "").toLowerCase();
  const dbNames = await db.product.findMany({ select: { tradeName: true } });
  const dbNorm = new Set(dbNames.map((p) => normName(p.tradeName)));
  const skippedDB = [];
  const kept = [];
  for (const c of pool) {
    const k = normName(c.name);
    if (dbNorm.has(k)) { skippedDB.push(c.name); continue; }
    kept.push(c);
  }
  const finalList = kept.slice(0, needed);
  console.log(`🧮 المجموعات المتاحة: ${combos.length} + توسيع عبوات ${extra.length} — سيتم إدخال ${finalList.length}`);
  if (skippedDB.length) console.log(`🚫 منع التكرار: تم تخطي ${skippedDB.length} صنف موجود مسبقاً بالاسم في القاعدة`);
  if (process.env.DRY_RUN) {
    const g = {};
    for (const c of finalList) g[c.cat] = (g[c.cat] || 0) + 1;
    console.log("DRY RUN — التوزيع:", JSON.stringify(g), "| السعة الكلية:", pool.length);
    return;
  }

  // 6-ب) إزالة التكرار الداخلي بالاسم — إلحاق حجم العبوة ثم رقم تسلسلي عند التعارض
  const seenNorm = new Set();
  for (const c of finalList) {
    const k = normName(c.name);
    if (!seenNorm.has(k)) { seenNorm.add(k); continue; }
    let newName = c.pack ? `${c.name} — ${c.pack}` : "";
    if (!newName || seenNorm.has(normName(newName)) || dbNorm.has(normName(newName))) {
      let i = 2;
      do { newName = `${c.name} (${i++})`; } while (seenNorm.has(normName(newName)) || dbNorm.has(normName(newName)));
    }
    c.name = newName;
    seenNorm.add(normName(c.name));
  }

  // 7) باركودات فريدة متسلسلة
  const existingBarcodes = new Set((await db.product.findMany({ select: { barcode: true } })).map((p) => p.barcode));
  let seq = 20001;
  const usedBC = new Set();
  for (const c of finalList) {
    let bc;
    do {
      const d12 = `6221048${String(seq++).padStart(5, "0")}`;
      bc = d12 + ean13CheckDigit(d12);
    } while (existingBarcodes.has(bc) || usedBC.has(bc));
    usedBC.add(bc);
    c.barcode = bc;
  }

  // 8) بناء صفوف الإدخال
  const rows = finalList.map((c) => {
    const cat = c.cat;
    const zone = ZONE[cat] || "A";
    const shelf = `${zone}${1 + Math.floor(rnd() * 6)}-${String(1 + Math.floor(rnd() * 30)).padStart(2, "0")}`;
    const isConsumer = c.group === "consumer";
    let minS, reorder;
    if (cat === "RX") { minS = 5 + Math.floor(rnd() * 6); reorder = minS + 7 + Math.floor(rnd() * 14); }
    else if (cat === "OTC") { minS = 8 + Math.floor(rnd() * 8); reorder = minS + 12 + Math.floor(rnd() * 20); }
    else if (cat === "MEDICAL_SUPPLY") { minS = 10 + Math.floor(rnd() * 10); reorder = minS + 15 + Math.floor(rnd() * 25); }
    else if (cat === "FOOD") { minS = 6 + Math.floor(rnd() * 6); reorder = minS + 9 + Math.floor(rnd() * 15); }
    else { minS = 4 + Math.floor(rnd() * 4); reorder = minS + 6 + Math.floor(rnd() * 10); }
    return {
      barcode: c.barcode,
      tradeName: c.name,
      tradeNameEn: c.te,
      scientificName: c.sci,
      activeIngredientId: c.ingId,
      dosageFormId: c.formKey ? (formByEn.get(c.formKey) || null) : null,
      concentration: c.conc,
      packSize: isConsumer ? null : c.pack,
      unitId: c.strip ? unitId("Strip") : (c.formKey ? (unitId(FORM_UNIT[c.formKey]) || null) : unitId("Piece")),
      manufacturerId: c.mfg,
      originCountry: c.origin,
      category: cat,
      purchasePrice: c.buy,
      sellPrice: c.sell,
      wholesalePrice: round2((c.buy + c.sell) / 2),
      taxRate: 14,
      minStock: minS,
      reorderPoint: reorder,
      shelfLocation: shelf,
      requiresPrescription: c.rx,
      isActive: true,
      notes: c.notes,
    };
  });

  // 9) الإدخال على دفعات
  const CHUNK = 300;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db.product.createMany({ data: chunk });
    inserted += chunk.length;
    process.stdout.write(`\r⏳ تم إدخال ${inserted}/${rows.length}`);
  }
  console.log("");

  // 9-ب) Multi-UoM: وحدة البيع الأساسية لكل صنف جديد (علبة/زجاجة/أنبوب… factor=1)
  const unitRecs = await db.unitOfMeasure.findMany();
  const unitRecById = new Map(unitRecs.map((u) => [u.id, u]));
  const createdProducts = await db.product.findMany({
    where: { barcode: { in: rows.map((r) => r.barcode) } },
    select: { id: true, unitId: true, sellPrice: true, wholesalePrice: true },
  });
  const puRows = createdProducts
    .filter((p) => p.unitId)
    .map((p) => ({
      productId: p.id,
      unitId: p.unitId,
      unitName: unitRecById.get(p.unitId)?.name || "وحدة",
      unitNameEn: unitRecById.get(p.unitId)?.nameEn || "Unit",
      factor: 1,
      sellPrice: p.sellPrice,
      wholesalePrice: p.wholesalePrice || null,
      isBase: true,
      isDefault: true,
    }));
  for (let i = 0; i < puRows.length; i += 500) {
    await db.productUnit.createMany({ data: puRows.slice(i, i + 500), skipDuplicates: true });
  }
  console.log(`🔖 وحدات البيع الأساسية (Multi-UoM): ${puRows.length}`);

  // 10) تقرير التحقق
  const total = await db.product.count();
  const distinctBC = await db.$queryRawUnsafe("SELECT COUNT(*) as c FROM (SELECT DISTINCT barcode FROM Product)");
  const byCat = await db.$queryRawUnsafe("SELECT category, COUNT(*) as c, MIN(sellPrice) as mn, MAX(sellPrice) as mx FROM Product GROUP BY category");
  const linked = await db.$queryRawUnsafe("SELECT COUNT(*) as c FROM Product WHERE manufacturerId IS NOT NULL");
  const ingLinked = await db.$queryRawUnsafe("SELECT COUNT(*) as c FROM Product WHERE activeIngredientId IS NOT NULL");
  const sample = await db.product.findMany({ take: 5, orderBy: { createdAt: "desc" }, select: { barcode: true, tradeName: true, category: true, sellPrice: true, packSize: true } });
  console.log("═══════════════════════════════════");
  console.log(`✅ إجمالي الأصناف الآن: ${total}`);
  console.log(`🔖 باركودات فريدة: ${distinctBC[0].c} من ${total}`);
  for (const r of byCat) console.log(`   ${r.category}: ${r.c} صنف (بيع ${r.mn} ← ${r.mx} ج.م)`);
  console.log(`🏭 مرتبطة بمصنّع: ${linked[0].c} — بمادة فعالة: ${ingLinked[0].c}`);
  console.log("عيّنة:", JSON.stringify(sample, null, 1));
}

main()
  .catch((e) => { console.error("❌ فشل:", e); process.exit(1); })
  .finally(() => db.$disconnect());

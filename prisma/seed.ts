/**
 * prisma/seed.ts — البذر القياسي المحمي (Auto Database Bootstrap)
 * ─────────────────────────────────────────────────────────────────
 * القاعدة الذهبية (Idempotent):
 *   • لا يُنفَّذ البذر إلا إذا كان جدول User فارغاً (count === 0)
 *   • إذا وُجدت بيانات → لا يفعل شيئاً إطلاقاً (لا تعديل ولا تكرار)
 *   • upsert كطبقة أمان إضافية للمستخدمين/الفروع/الأصناف/الإعدادات
 *   • الحذف متاح فقط عبر resetDatabase() التي يستدعيها سكربت إعادة
 *     التعيين اليدوي scripts/seed.ts — لا يُستدعى هنا أبداً
 *
 * بيانات مصرية واقعية: أدوية، شركات، مواد فعالة، عملاء، موردين، فواتير تاريخية
 */
import { PrismaClient, Prisma, MovementType, InvoiceStatus, PaymentMethod, ProductCategory, PurchaseOrderStatus, PrescriptionStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";

type TxClient = PrismaClient | Prisma.TransactionClient;

// ─── أدوات مساعدة (عشوائية ثابتة البذرة) ───
let _seed = 42;
function rand(): number {
  _seed = (_seed * 9301 + 49297) % 233280;
  return _seed / 233280;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function daysAgo(n: number, hour = 12, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, randInt(0, 59), 0);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * إعادة تعيين كاملة — تحذف كل الجداول بالترتيب الصحيح.
 * ⚠️ لا تُستدعى من مسار الإقلاع التلقائي — فقط من scripts/seed.ts اليدوي.
 */
export async function resetDatabase(db: TxClient) {
  console.log("🧹 تنظيف قاعدة البيانات...");
  await db.invoiceItem.deleteMany();
  await db.invoice.deleteMany();
  await db.prescriptionItem.deleteMany();
  await db.prescription.deleteMany();
  await db.goodsReceiptItem.deleteMany();
  await db.goodsReceipt.deleteMany();
  await db.purchaseOrderItem.deleteMany();
  await db.purchaseOrder.deleteMany();
  await db.stockCountItem.deleteMany();
  await db.stockCount.deleteMany();
  await db.stockMovement.deleteMany();
  await db.batch.deleteMany();
  await db.product.deleteMany();
  await db.drugInteraction.deleteMany();
  await db.activeIngredient.deleteMany();
  await db.manufacturer.deleteMany();
  await db.dosageForm.deleteMany();
  await db.unitOfMeasure.deleteMany();
  await db.attendance.deleteMany();
  await db.payroll.deleteMany();
  await db.employee.deleteMany();
  await db.expense.deleteMany();
  await db.shift.deleteMany();
  await db.notification.deleteMany();
  await db.auditLog.deleteMany();
  await db.settingSnapshot.deleteMany();
  await db.coupon.deleteMany();
  await db.serviceItem.deleteMany();
  await db.supplier.deleteMany();
  await db.customer.deleteMany();
  await db.doctor.deleteMany();
  await db.user.deleteMany();
  await db.branch.deleteMany();
  await db.settings.deleteMany();
}

/**
 * البذر الفعلي — يُستدعى فقط على قاعدة فارغة.
 * upsert للمستخدمين/الفروع/الأصناف/الإعدادات: لن يكرر ولا يعدل بيانات موجودة.
 */
export async function seedDatabase(db: TxClient) {
  console.log("🏥 الفروع...");
  const brMain = await db.branch.upsert({
    where: { code: "BR01" },
    update: {},
    create: { code: "BR01", name: "فرع المعادي (الرئيسي)", nameEn: "Maadi Branch (Main)", address: "شارع 9، المعادي، القاهرة", phone: "0225216789", isDefault: true },
  });
  const brNasr = await db.branch.upsert({
    where: { code: "BR02" },
    update: {},
    create: { code: "BR02", name: "فرع مدينة نصر", nameEn: "Nasr City Branch", address: "شارع عباس العقاد، مدينة نصر", phone: "0224045566" },
  });

  console.log("🏭 المخازن...");
  await db.warehouse.upsert({
    where: { code: "WH01" },
    update: {},
    create: { code: "WH01", name: "المستودع الرئيسي", nameEn: "Main Warehouse", branchId: brMain.id, location: "بدء فرع المعادي", phone: "0225216790", manager: "مصطفى كامل", isMain: true },
  });
  await db.warehouse.upsert({
    where: { code: "WH02" },
    update: {},
    create: { code: "WH02", name: "مستودع مدينة نصر", nameEn: "Nasr City Depot", branchId: brNasr.id, location: "شارع عباس العقاد", phone: "0224045567", manager: "هاني عادل" },
  });
  await db.warehouse.upsert({
    where: { code: "WH03" },
    update: {},
    create: { code: "WH03", name: "مستودع الحجر الصحي", nameEn: "Quarantine Store", branchId: null, location: "المنطقة الصناعية، العبور", phone: "0264611000", manager: "أحمد فتحي", notes: "الأصناف الموقوفة أو قيد الفحص" },
  });

  console.log("👥 المستخدمون (5 أدوار)...");
  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const uAdmin = await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash: hash("Admin@123"), fullName: "أحمد عبد الرحمن", fullNameEn: "Ahmed Abdelrahman", role: "ADMIN", phone: "01001234567", branchId: brMain.id },
  });
  const uPharma = await db.user.upsert({
    where: { username: "pharmacist" },
    update: {},
    create: { username: "pharmacist", passwordHash: hash("Pharma@123"), fullName: "د. سارة محمود", fullNameEn: "Dr. Sara Mahmoud", role: "PHARMACIST", phone: "01012345678", branchId: brMain.id },
  });
  const uCashier = await db.user.upsert({
    where: { username: "cashier" },
    update: {},
    create: { username: "cashier", passwordHash: hash("Cashier@123"), fullName: "محمد سعيد", fullNameEn: "Mohamed Saeed", role: "CASHIER", pin: "1234", phone: "01023456789", branchId: brMain.id },
  });
  const uAcc = await db.user.upsert({
    where: { username: "accountant" },
    update: {},
    create: { username: "accountant", passwordHash: hash("Account@123"), fullName: "خالد يوسف", fullNameEn: "Khaled Yousef", role: "ACCOUNTANT", phone: "01034567890", branchId: brMain.id },
  });
  const uInv = await db.user.upsert({
    where: { username: "inventory" },
    update: {},
    create: { username: "inventory", passwordHash: hash("Inv@123"), fullName: "مصطفى كامل", fullNameEn: "Mostafa Kamel", role: "INVENTORY_MANAGER", phone: "01045678901", branchId: brNasr.id },
  });

  console.log("🏭 البيانات الأساسية...");
  const mfgNames: Array<[string, string, string]> = [
    ["GSK مصر", "GSK Egypt", "المملكة المتحدة"],
    ["نوفارتس", "Novartis", "سويسرا"],
    ["سانوفى", "Sanofi", "فرنسا"],
    ["هيكما للأدوية", "Hikma Pharmaceuticals", "الأردن"],
    ["إيبكو", "EIPICO", "مصر"],
    ["أمون", "Amoun Pharmaceutical", "مصر"],
    ["فاركو", "Pharco", "مصر"],
    ["سيجما للأدوية", "SIGMA Pharmaceuticals", "مصر"],
    ["جلوبال نابي", "Global Napi", "مصر"],
    ["إيبكو للتوكيلات", "EIPICO Trade", "مصر"],
  ];
  const mfgs: any[] = [];
  for (const [name, nameEn, country] of mfgNames) mfgs.push(await db.manufacturer.create({ data: { name, nameEn, country } }));

  const ingData: Array<[string, string]> = [
    ["باراسيتامول", "Paracetamol"],
    ["إيبوبروفين", "Ibuprofen"],
    ["أموكسيسيلين + كلافولانيك أسيد", "Amoxicillin + Clavulanic Acid"],
    ["ديكلوفيناك صوديوم", "Diclofenac Sodium"],
    ["بيسوبرولول", "Bisoprolol"],
    ["ميتفورمين", "Metformin"],
    ["سالبوتامول", "Salbutamol"],
    ["فيوسيديك أسيد", "Fusidic Acid"],
    ["زايلوميتازولين", "Xylometazoline"],
    ["فيكسوفينادين", "Fexofenadine"],
    ["أسبرين", "Aspirin"],
    ["وارفارين", "Warfarin"],
    ["سيبروفلوكساسين", "Ciprofloxacin"],
    ["سيفوروكسيم", "Cefuroxime"],
    ["مترونيدازول", "Metronidazole"],
    ["أوميبرازول", "Omeprazole"],
    ["أملوديبين", "Amlodipine"],
    ["فيتامين سي", "Vitamin C"],
    ["أوميغا 3", "Omega-3"],
  ];
  const ings: any[] = [];
  for (const [name, nameEn] of ingData) ings.push(await db.activeIngredient.create({ data: { name, nameEn } }));
  const ing = (en: string) => ings.find((i) => i.nameEn === en)!;

  const formsData: Array<[string, string]> = [
    ["أقراص", "Tablets"], ["كبسولات", "Capsules"], ["شراب", "Syrup"],
    ["مرهم", "Ointment"], ["كريم", "Cream"], ["بخاخ", "Spray"],
    ["أقراص مكسوة", "Film-coated Tablets"], ["بخاخ استنشاق", "Inhaler"],
  ];
  const forms: any[] = [];
  for (const [name, nameEn] of formsData) forms.push(await db.dosageForm.create({ data: { name, nameEn } }));
  const form = (en: string) => forms.find((f) => f.nameEn === en)!;

  const unitsData: Array<[string, string]> = [["علبة", "Box"], ["شريط", "Strip"], ["قطعة", "Piece"], ["زجاجة", "Bottle"], ["أنبوب", "Tube"]];
  const units: any[] = [];
  for (const [name, nameEn] of unitsData) units.push(await db.unitOfMeasure.create({ data: { name, nameEn } }));
  const unit = (en: string) => units.find((u) => u.nameEn === en)!;

  console.log("💊 الأدوية والمنتجات...");
  type PDef = {
    bc: string; t: string; te: string; sci: string; ingId?: string; formId?: string; conc?: string; pack?: string; unitId?: string; mfgId?: string; origin?: string;
    cat: ProductCategory; buy: number; sell: number; wh: number; tax: number; rx: boolean; minS: number; reorder: number; shelf: string;
  };
  const prodDefs: PDef[] = [
    { bc: "6221048100015", t: "بانادول إكسترا 500 مجم", te: "Panadol Extra", sci: "Paracetamol + Caffeine", ingId: ing("Paracetamol").id, formId: form("Tablets").id, conc: "500 مجم", pack: "24 قرص", unitId: unit("Box").id, mfgId: mfgs[0].id, origin: "المملكة المتحدة", cat: "OTC", buy: 42, sell: 54, wh: 48, tax: 14, rx: false, minS: 10, reorder: 24, shelf: "A1-03" },
    { bc: "6221048100022", t: "أدول 500 مجم", te: "Adol", sci: "Paracetamol", ingId: ing("Paracetamol").id, formId: form("Tablets").id, conc: "500 مجم", pack: "20 قرص", unitId: unit("Box").id, mfgId: mfgs[4].id, origin: "مصر", cat: "OTC", buy: 20, sell: 27, wh: 24, tax: 14, rx: false, minS: 12, reorder: 30, shelf: "A1-04" },
    { bc: "6221048100039", t: "سيتال 500 مجم", te: "Cetal", sci: "Paracetamol", ingId: ing("Paracetamol").id, formId: form("Tablets").id, conc: "500 مجم", pack: "20 قرص", unitId: unit("Box").id, mfgId: mfgs[7].id, origin: "مصر", cat: "OTC", buy: 16, sell: 22, wh: 19, tax: 14, rx: false, minS: 12, reorder: 30, shelf: "A1-05" },
    { bc: "6221048100046", t: "بروفين 400 مجم", te: "Brufen", sci: "Ibuprofen", ingId: ing("Ibuprofen").id, formId: form("Tablets").id, conc: "400 مجم", pack: "30 قرص", unitId: unit("Box").id, mfgId: mfgs[2].id, origin: "فرنسا", cat: "OTC", buy: 30, sell: 40, wh: 35, tax: 14, rx: false, minS: 8, reorder: 20, shelf: "A1-06" },
    { bc: "6221048100053", t: "نيوروفين أطفال شراب", te: "Nurofen Kids", sci: "Ibuprofen", ingId: ing("Ibuprofen").id, formId: form("Syrup").id, conc: "100 مجم/5مل", pack: "زجاجة 100 مل", unitId: unit("Bottle").id, mfgId: mfgs[2].id, origin: "فرنسا", cat: "OTC", buy: 48, sell: 63, wh: 56, tax: 14, rx: false, minS: 6, reorder: 15, shelf: "A2-01" },
    { bc: "6221048100060", t: "أسبوكيد 75 مجم", te: "Aspocid", sci: "Aspirin", ingId: ing("Aspirin").id, formId: form("Tablets").id, conc: "75 مجم", pack: "30 قرص", unitId: unit("Box").id, mfgId: mfgs[8].id, origin: "مصر", cat: "OTC", buy: 12, sell: 18, wh: 15, tax: 14, rx: false, minS: 10, reorder: 25, shelf: "A1-07" },
    { bc: "6221048100077", t: "وارين 5 مجم", te: "Warin", sci: "Warfarin", ingId: ing("Warfarin").id, formId: form("Tablets").id, conc: "5 مجم", pack: "30 قرص", unitId: unit("Box").id, mfgId: mfgs[8].id, origin: "مصر", cat: "RX", buy: 35, sell: 46, wh: 41, tax: 14, rx: true, minS: 5, reorder: 12, shelf: "B1-01" },
    { bc: "6221048100084", t: "أوجمنتين 1 جم", te: "Augmentin", sci: "Amoxicillin + Clavulanic Acid", ingId: ing("Amoxicillin + Clavulanic Acid").id, formId: form("Film-coated Tablets").id, conc: "1 جم", pack: "14 قرص", unitId: unit("Box").id, mfgId: mfgs[0].id, origin: "المملكة المتحدة", cat: "RX", buy: 148, sell: 182, wh: 165, tax: 14, rx: true, minS: 6, reorder: 16, shelf: "B1-02" },
    { bc: "6221048100091", t: "زينات 500 مجم", te: "Zinnat", sci: "Cefuroxime", ingId: ing("Cefuroxime").id, formId: form("Tablets").id, conc: "500 مجم", pack: "10 قرص", unitId: unit("Box").id, mfgId: mfgs[0].id, origin: "المملكة المتحدة", cat: "RX", buy: 162, sell: 198, wh: 180, tax: 14, rx: true, minS: 5, reorder: 12, shelf: "B1-03" },
    { bc: "6221048100107", t: "سيبروكسين 500 مجم", te: "Ciproxin", sci: "Ciprofloxacin", ingId: ing("Ciprofloxacin").id, formId: form("Tablets").id, conc: "500 مجم", pack: "10 قرص", unitId: unit("Box").id, mfgId: mfgs[1].id, origin: "سويسرا", cat: "RX", buy: 68, sell: 86, wh: 77, tax: 14, rx: true, minS: 5, reorder: 12, shelf: "B1-04" },
    { bc: "6221048100114", t: "فلاجيل 500 مجم", te: "Flagyl", sci: "Metronidazole", ingId: ing("Metronidazole").id, formId: form("Tablets").id, conc: "500 مجم", pack: "20 قرص", unitId: unit("Box").id, mfgId: mfgs[2].id, origin: "فرنسا", cat: "RX", buy: 34, sell: 45, wh: 40, tax: 14, rx: true, minS: 6, reorder: 15, shelf: "B1-05" },
    { bc: "6221048100121", t: "فولتارين 50 مجم", te: "Voltaren", sci: "Diclofenac Sodium", ingId: ing("Diclofenac Sodium").id, formId: form("Tablets").id, conc: "50 مجم", pack: "20 قرص", unitId: unit("Box").id, mfgId: mfgs[1].id, origin: "سويسرا", cat: "RX", buy: 38, sell: 49, wh: 44, tax: 14, rx: false, minS: 8, reorder: 20, shelf: "A1-08" },
    { bc: "6221048100138", t: "كاتافلام 50 مجم", te: "Cataflam", sci: "Diclofenac Sodium", ingId: ing("Diclofenac Sodium").id, formId: form("Tablets").id, conc: "50 مجم", pack: "20 قرص", unitId: unit("Box").id, mfgId: mfgs[1].id, origin: "سويسرا", cat: "RX", buy: 42, sell: 54, wh: 48, tax: 14, rx: false, minS: 6, reorder: 15, shelf: "A1-09" },
    { bc: "6221048100145", t: "كونكور 5 مجم", te: "Concor", sci: "Bisoprolol", ingId: ing("Bisoprolol").id, formId: form("Film-coated Tablets").id, conc: "5 مجم", pack: "30 قرص", unitId: unit("Box").id, mfgId: mfgs[1].id, origin: "ألمانيا", cat: "RX", buy: 72, sell: 91, wh: 82, tax: 14, rx: true, minS: 8, reorder: 20, shelf: "B2-01" },
    { bc: "6221048100152", t: "جلوكوفاج 1000 مجم", te: "Glucophage", sci: "Metformin", ingId: ing("Metformin").id, formId: form("Film-coated Tablets").id, conc: "1000 مجم", pack: "30 قرص", unitId: unit("Box").id, mfgId: mfgs[2].id, origin: "فرنسا", cat: "RX", buy: 62, sell: 79, wh: 71, tax: 14, rx: true, minS: 8, reorder: 20, shelf: "B2-02" },
    { bc: "6221048100169", t: "أملور 5 مجم", te: "Amlor", sci: "Amlodipine", ingId: ing("Amlodipine").id, formId: form("Capsules").id, conc: "5 مجم", pack: "30 كبسولة", unitId: unit("Box").id, mfgId: mfgs[0].id, origin: "فرنسا", cat: "RX", buy: 76, sell: 95, wh: 86, tax: 14, rx: true, minS: 6, reorder: 15, shelf: "B2-03" },
    { bc: "6221048100176", t: "فنتولين بخاخ", te: "Ventolin", sci: "Salbutamol", ingId: ing("Salbutamol").id, formId: form("Inhaler").id, conc: "100 مجم/جرعة", pack: "بخاخ 200 جرعة", unitId: unit("Piece").id, mfgId: mfgs[0].id, origin: "المملكة المتحدة", cat: "RX", buy: 52, sell: 66, wh: 59, tax: 14, rx: true, minS: 5, reorder: 12, shelf: "B2-04" },
    { bc: "6221048100183", t: "أوتريفين 0.1٪", te: "Otrivin", sci: "Xylometazoline", ingId: ing("Xylometazoline").id, formId: form("Spray").id, conc: "0.1٪", pack: "بخاخ 10 مل", unitId: unit("Piece").id, mfgId: mfgs[1].id, origin: "سويسرا", cat: "OTC", buy: 42, sell: 55, wh: 49, tax: 14, rx: false, minS: 6, reorder: 15, shelf: "A2-02" },
    { bc: "6221048100190", t: "تيلفاست 180 مجم", te: "Telfast", sci: "Fexofenadine", ingId: ing("Fexofenadine").id, formId: form("Film-coated Tablets").id, conc: "180 مجم", pack: "10 قرص", unitId: unit("Box").id, mfgId: mfgs[2].id, origin: "فرنسا", cat: "OTC", buy: 88, sell: 112, wh: 100, tax: 14, rx: false, minS: 6, reorder: 15, shelf: "A2-03" },
    { bc: "6221048100206", t: "فيوسيدين كريم", te: "Fucidin", sci: "Fusidic Acid", ingId: ing("Fusidic Acid").id, formId: form("Cream").id, conc: "2٪", pack: "أنبوب 15 جم", unitId: unit("Tube").id, mfgId: mfgs[2].id, origin: "فرنسا", cat: "RX", buy: 48, sell: 61, wh: 55, tax: 14, rx: false, minS: 6, reorder: 15, shelf: "A3-01" },
    { bc: "6221048100213", t: "أوميز 20 مجم", te: "Omez", sci: "Omeprazole", ingId: ing("Omeprazole").id, formId: form("Capsules").id, conc: "20 مجم", pack: "14 كبسولة", unitId: unit("Box").id, mfgId: mfgs[6].id, origin: "مصر", cat: "RX", buy: 28, sell: 37, wh: 33, tax: 14, rx: false, minS: 8, reorder: 20, shelf: "B2-05" },
    { bc: "6221048100220", t: "فيتامين سي 1000 فوار", te: "Vitamin C", sci: "Ascorbic Acid", ingId: ing("Vitamin C").id, formId: form("Tablets").id, conc: "1000 مجم", pack: "20 قرص فوار", unitId: unit("Tube").id, mfgId: mfgs[4].id, origin: "مصر", cat: "OTC", buy: 24, sell: 32, wh: 28, tax: 14, rx: false, minS: 10, reorder: 25, shelf: "C1-01" },
    { bc: "6221048100237", t: "أوميغا 3 بلس", te: "Omega", sci: "Omega-3 Fatty Acids", ingId: ing("Omega-3").id, formId: form("Capsules").id, conc: "1000 مجم", pack: "60 كبسولة", unitId: unit("Box").id, mfgId: mfgs[8].id, origin: "مصر", cat: "FOOD", buy: 98, sell: 128, wh: 114, tax: 0, rx: false, minS: 5, reorder: 10, shelf: "C1-02" },
    { bc: "6221048100244", t: "شرائط قياس سكر أكيوتشيك", te: "Accu-Chek Strips", sci: "-", cat: "MEDICAL_SUPPLY", buy: 265, sell: 325, wh: 295, tax: 14, rx: false, minS: 4, reorder: 8, shelf: "D1-01", unitId: unit("Box").id, pack: "50 شريط" },
    { bc: "6221048100251", t: "كمامات طبية 3 طبقات", te: "Medical Masks", sci: "-", cat: "MEDICAL_SUPPLY", buy: 10, sell: 16, wh: 13, tax: 14, rx: false, minS: 20, reorder: 50, shelf: "D1-02", unitId: unit("Box").id, pack: "50 كمام" },
    { bc: "6221048100268", t: "سرنجات 5 مل", te: "Syringes", sci: "-", cat: "MEDICAL_SUPPLY", buy: 8, sell: 13, wh: 10, tax: 14, rx: false, minS: 20, reorder: 50, shelf: "D1-03", unitId: unit("Box").id, pack: "100 سرنجة" },
    { bc: "6221048100275", t: "واقي شمس فاسيلين SPF50", te: "Vaseline Sunscreen", sci: "-", cat: "COSMETIC", buy: 168, sell: 215, wh: 192, tax: 14, rx: false, minS: 4, reorder: 10, shelf: "E1-01", unitId: unit("Tube").id, pack: "75 مل" },
    { bc: "6221048100282", t: "حليب أطفال بيبلاك 1", te: "Bebelac", sci: "-", cat: "FOOD", buy: 235, sell: 295, wh: 265, tax: 0, rx: false, minS: 5, reorder: 12, shelf: "E1-02", unitId: unit("Box").id, pack: "400 جم" },
  ];
  const products: any[] = [];
  for (const d of prodDefs) {
    products.push(await db.product.upsert({
      where: { barcode: d.bc },
      update: {},
      create: {
        barcode: d.bc, tradeName: d.t, tradeNameEn: d.te, scientificName: d.sci,
        activeIngredientId: d.ingId ?? null, dosageFormId: d.formId ?? null,
        concentration: d.conc ?? null, packSize: d.pack ?? null,
        unitId: d.unitId ?? null, manufacturerId: d.mfgId ?? null, originCountry: d.origin ?? null,
        category: d.cat, purchasePrice: d.buy, sellPrice: d.sell, wholesalePrice: d.wh,
        taxRate: d.tax, requiresPrescription: d.rx, minStock: d.minS, reorderPoint: d.reorder,
        shelfLocation: d.shelf, isActive: true,
      },
    }));
  }
  const prod = (te: string) => products.find((p) => p.tradeNameEn!.includes(te))!;

  console.log("📦 التشغيلات — صلاحيات متنوعة لاختبار التنبيهات...");
  type BPlan = { prod: string; branch: string; batchNo: string; expDays: number; qty: number };
  const batchPlans: BPlan[] = [
    { prod: "Panadol", branch: brMain.id, batchNo: "PN2409A", expDays: 640, qty: 85 },
    { prod: "Panadol", branch: brMain.id, batchNo: "PN2501B", expDays: 18, qty: 30 },
    { prod: "Panadol", branch: brNasr.id, batchNo: "PN2409C", expDays: 640, qty: 40 },
    { prod: "Adol", branch: brMain.id, batchNo: "AD2503", expDays: 250, qty: 120 },
    { prod: "Adol", branch: brNasr.id, batchNo: "AD2503N", expDays: 250, qty: 55 },
    { prod: "Cetal", branch: brMain.id, batchNo: "CT2504", expDays: 200, qty: 12 },
    { prod: "Brufen", branch: brMain.id, batchNo: "BF2502", expDays: 8, qty: 26 },
    { prod: "Brufen", branch: brMain.id, batchNo: "BF2508", expDays: 400, qty: 35 },
    { prod: "Nurofen", branch: brMain.id, batchNo: "NR2501", expDays: 300, qty: 22 },
    { prod: "Aspocid", branch: brMain.id, batchNo: "AS2505", expDays: 170, qty: 60 },
    { prod: "Warin", branch: brMain.id, batchNo: "WR2503", expDays: 230, qty: 18 },
    { prod: "Augmentin", branch: brMain.id, batchNo: "AU2501", expDays: 95, qty: 14 },
    { prod: "Augmentin", branch: brMain.id, batchNo: "AU2506", expDays: 380, qty: 20 },
    { prod: "Augmentin", branch: brNasr.id, batchNo: "AU2506N", expDays: 380, qty: 10 },
    { prod: "Zinnat", branch: brMain.id, batchNo: "ZN2504", expDays: 280, qty: 9 },
    { prod: "Ciproxin", branch: brMain.id, batchNo: "CP2502", expDays: 320, qty: 16 },
    { prod: "Flagyl", branch: brMain.id, batchNo: "FG2503", expDays: 260, qty: 30 },
    { prod: "Voltaren", branch: brMain.id, batchNo: "VT2501", expDays: -55, qty: 8 },
    { prod: "Voltaren", branch: brMain.id, batchNo: "VT2508", expDays: 420, qty: 28 },
    { prod: "Cataflam", branch: brMain.id, batchNo: "CF2502", expDays: 310, qty: 18 },
    { prod: "Concor", branch: brMain.id, batchNo: "CC2501", expDays: 350, qty: 42 },
    { prod: "Concor", branch: brNasr.id, batchNo: "CC2501N", expDays: 350, qty: 15 },
    { prod: "Glucophage", branch: brMain.id, batchNo: "GP2502", expDays: 290, qty: 36 },
    { prod: "Amlor", branch: brMain.id, batchNo: "AM2503", expDays: 240, qty: 4 },
    { prod: "Ventolin", branch: brMain.id, batchNo: "VN2504", expDays: 210, qty: 11 },
    { prod: "Otrivin", branch: brMain.id, batchNo: "OT2502", expDays: 330, qty: 19 },
    { prod: "Telfast", branch: brMain.id, batchNo: "TF2503", expDays: 270, qty: 24 },
    { prod: "Fucidin", branch: brMain.id, batchNo: "FC2502", expDays: 460, qty: 21 },
    { prod: "Omez", branch: brMain.id, batchNo: "OM2503", expDays: 285, qty: 33 },
    { prod: "Vitamin", branch: brMain.id, batchNo: "VC2501", expDays: 500, qty: 44 },
    { prod: "Omega", branch: brMain.id, batchNo: "OW2501", expDays: 540, qty: 17 },
    { prod: "Accu", branch: brMain.id, batchNo: "AC2506", expDays: 400, qty: 9 },
    { prod: "Masks", branch: brMain.id, batchNo: "MK2509", expDays: 700, qty: 45 },
    { prod: "Syringes", branch: brMain.id, batchNo: "SY2509", expDays: 700, qty: 60 },
    { prod: "Vaseline", branch: brMain.id, batchNo: "VS2507", expDays: 480, qty: 12 },
    { prod: "Bebelac", branch: brMain.id, batchNo: "BB2508", expDays: 350, qty: 14 },
  ];
  const batches: any[] = [];
  for (const bp of batchPlans) {
    const p = prod(bp.prod);
    const created = await db.batch.create({
      data: {
        productId: p.id, branchId: bp.branch, batchNo: bp.batchNo,
        expiryDate: daysFromNow(bp.expDays), quantity: bp.qty,
        costPrice: p.purchasePrice, shelfLocation: p.shelfLocation,
      },
    });
    batches.push(created);
    await db.stockMovement.create({
      data: { productId: p.id, batchId: created.id, branchId: bp.branch, type: "RECEIVE" as MovementType, quantity: bp.qty, refType: "GRN", refId: "GRN-0001", note: "استلام افتتاحي للمخزون", userId: uInv.id, createdAt: daysAgo(60, 10) },
    });
  }

  console.log("🤝 التداخلات الدوائية...");
  const interactionsData: Array<[string, string, string, string]> = [
    ["Warfarin", "Aspirin", "MAJOR", "خطر نزيف حاد: تجنب الاستخدام المتزامن أو راقب INR بدقة"],
    ["Warfarin", "Ibuprofen", "MAJOR", "مضادات الالتهاب تزيد تأثير الوارفارين وخطورة النزيف المعدي"],
    ["Warfarin", "Paracetamol", "MODERATE", "الجرعات العالية المتكررة قد ترفع INR — راقب المستخدم"],
    ["Aspirin", "Ibuprofen", "MODERATE", "إيبوبروفين يقلل التأثير الوقائي للأسبيرين على الصفائح الدموية"],
    ["Diclofenac Sodium", "Ibuprofen", "MODERATE", "تكرار NSAIDs: خطر قرحة معوية — لا تجمعهما"],
    ["Diclofenac Sodium", "Aspirin", "MODERATE", "قد يقلل تأثير الأسبيرين القلبي ويزيد خطر النزيف"],
  ];
  for (const [a, b, sev, desc] of interactionsData) {
    await db.drugInteraction.create({ data: { ingredientAId: ing(a).id, ingredientBId: ing(b).id, severity: sev as any, description: desc } });
  }

  console.log("👨‍⚕️ الأطباء...");
  const docData: Array<[string, string, string, string]> = [
    ["د. أحمد الشاذلي", "باطنة وجهاز هضمي", "عيادة الشاذلي — المعادي", "01001112233"],
    ["د. منى عادل", "طب الأطفال", "عيادات مصر — مدينة نصر", "01002223344"],
    ["د. حسام فؤاد", "قلب وأوعية دموية", "مركز القلب التخصصي", "01003334455"],
    ["د. ريم سمير", "جلدية", "عيادة لاميس ديرما", "01004445566"],
  ];
  const doctors: any[] = [];
  for (const [name, specialty, clinic, phone] of docData) doctors.push(await db.doctor.create({ data: { name, specialty, clinic, phone } }));

  console.log("🧾 الخدمات والكوبونات...");
  const serviceData: Array<[string, string, number]> = [
    ["قياس ضغط الشريان", "Blood Pressure Check", 10],
    ["قياس السكر العشوائي", "Random Blood Sugar", 15],
    ["قياس السكر التراكمي HbA1c", "HbA1c Test", 35],
    ["حقن عضلي", "IM Injection", 20],
    ["تركيب وصفة طبية", "Prescription Compounding", 5],
  ];
  for (const [name, nameEn, price] of serviceData) await db.serviceItem.create({ data: { name, nameEn, price } });
  await db.coupon.upsert({ where: { code: "WELCOME10" }, update: {}, create: { code: "WELCOME10", type: "PERCENT", value: 10 } });
  await db.coupon.upsert({ where: { code: "PHARMA25" }, update: {}, create: { code: "PHARMA25", type: "FIXED", value: 25 } });

  console.log("🧑‍🤝‍🧑 العملاء...");
  const custData: Array<[string, string, string, string | null, string | null, string | null, string | null, number]> = [
    ["محمود السيد", "01055500011", "NORMAL", null, null, null, null, 145],
    ["فاطمة عبد الله", "01055500022", "VIP", null, null, "أسبرين", "ضغط الدم المرتفع", 520],
    ["حسن إبراهيم", "01055500033", "NORMAL", null, null, null, "السكري النوع 2", 80],
    ["نورهان جمال", "01055500044", "INSURANCE", "الرعاية الشاملة للتأمين", "MED-778812", null, null, 240],
    ["عمر طارق", "01055500055", "NORMAL", null, null, null, null, 0],
    ["سلمى فتحي", "01055500066", "VIP", null, null, null, "ربو", 860],
    ["كريم عادل", "01055500077", "INSURANCE", "متعاقدين — مصر", "MED-334455", null, "ارتفاع الدهون", 110],
    ["ياسمين ماهر", "01055500088", "NORMAL", null, null, "بنسلين", null, 35],
    ["طارق منصور", "01055500099", "NORMAL", null, null, null, null, 0],
    ["هدى كمال", "01055500100", "NORMAL", null, null, null, null, 60],
  ];
  const customers: any[] = [];
  let custSeq = 1;
  for (const [name, phone, type, insProv, insNo, allergies, chronic, points] of custData) {
    customers.push(await db.customer.create({
      data: {
        code: `CUS-${String(custSeq++).padStart(4, "0")}`,
        name, phone, type: type as any, insuranceProvider: insProv, insuranceNumber: insNo,
        allergies, chronicDiseases: chronic, loyaltyPoints: points,
        creditBalance: name === "طارق منصور" ? 150 : 0,
        email: name === "نورهان جمال" ? "norhan.g@example.com" : null,
        address: pick(["المعادي، القاهرة", "مدينة نصر، القاهرة", "حلمية الزيتون", "زهراء المعادي"]),
        gender: pick(["MALE", "FEMALE"]),
      },
    }));
  }

  console.log("🚚 الموردين...");
  const supData: Array<[string, string, string, string, string, string, number]> = [
    ["SUP-0001", "ابن سينا فارما", "م. رامي شريف", "0226184400", "sales@ibnsina.pharma", "آجل 30 يوم", 12500],
    ["SUP-0002", "فارما أوفرسيز", "أ. دينا سمير", "0224710300", "orders@pharmaoverseas.com", "آجل 15 يوم", 8300],
    ["SUP-0003", "مولتي فارما", "م. أشرف زكي", "0223411900", "info@multipharma.eg", "نقدي مع خصم 2٪", 0],
    ["SUP-0004", "إيبكو للتوكيلات", "أ. أحمد حسن", "0223450700", "trade@eipico.com", "آجل 45 يوم", 15600],
  ];
  const suppliers: any[] = [];
  for (const [code, name, contact, phone, email, terms, balance] of supData) {
    suppliers.push(await db.supplier.upsert({ where: { code }, update: {}, create: { code, name, contactPerson: contact, phone, email, address: pick(["العبور، القليوبية", "التجمع الخامس", "مدينة 6 أكتوبر", "السالخدار، الجيزة"]), paymentTerms: terms, balance } }));
  }

  console.log("🛒 أوامر الشراء + الاستلام...");
  const po1Items = [
    { productId: prod("Panadol").id, qty: 50, unitCost: 42 },
    { productId: prod("Adol").id, qty: 80, unitCost: 20 },
    { productId: prod("Concor").id, qty: 24, unitCost: 72 },
  ];
  const po1Sub = po1Items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const po1 = await db.purchaseOrder.create({
    data: {
      no: "PO-0001", supplierId: suppliers[0].id, branchId: brMain.id, userId: uInv.id,
      status: "RECEIVED" as PurchaseOrderStatus, subtotal: po1Sub, tax: 0, total: po1Sub,
      expectedAt: daysAgo(20), notes: "توريد شهر نوفمبر", createdAt: daysAgo(25, 11),
      items: { create: po1Items.map((i) => ({ ...i, receivedQty: i.qty })) },
    },
  });
  const grn1 = await db.goodsReceipt.create({
    data: {
      no: "GRN-0001", supplierId: suppliers[0].id, purchaseOrderId: po1.id, branchId: brMain.id,
      userId: uInv.id, subtotal: po1Sub, total: po1Sub, notes: "استلام كامل — فاتورة مورد 78451",
      createdAt: daysAgo(20, 13),
      items: { create: [
        { productId: prod("Panadol").id, batchNo: "PN2409A", expiryDate: daysFromNow(640), qty: 50, unitCost: 42, shelfLocation: "A1-03" },
        { productId: prod("Adol").id, batchNo: "AD2503", expiryDate: daysFromNow(250), qty: 80, unitCost: 20, shelfLocation: "A1-04" },
        { productId: prod("Concor").id, batchNo: "CC2501", expiryDate: daysFromNow(350), qty: 24, unitCost: 72, shelfLocation: "B2-01" },
      ] },
    },
  });
  for (const it of po1Items) {
    const b = batches.find((x) => x.productId === it.productId && x.branchId === brMain.id);
    if (b) await db.stockMovement.create({ data: { productId: it.productId, batchId: b.id, branchId: brMain.id, type: "RECEIVE" as MovementType, quantity: it.qty, refType: "GRN", refId: grn1.no, note: `استلام من ${suppliers[0].name}`, userId: uInv.id, createdAt: daysAgo(20, 13) } });
  }

  const po2Items = [
    { productId: prod("Augmentin").id, qty: 20, unitCost: 148 },
    { productId: prod("Telfast").id, qty: 15, unitCost: 88 },
    { productId: prod("Amlor").id, qty: 10, unitCost: 76 },
    { productId: prod("Accu").id, qty: 6, unitCost: 265 },
  ];
  const po2Sub = po2Items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  await db.purchaseOrder.create({
    data: {
      no: "PO-0002", supplierId: suppliers[1].id, branchId: brMain.id, userId: uInv.id,
      status: "SENT" as PurchaseOrderStatus, subtotal: po2Sub, total: po2Sub,
      expectedAt: daysFromNow(5), notes: "تعويض نواقص الأدوية الحيوية", createdAt: daysAgo(3, 10),
      items: { create: po2Items.map((i) => ({ ...i, receivedQty: 0 })) },
    },
  });

  const po3Items = [
    { productId: prod("Bebelac").id, qty: 20, unitCost: 235 },
    { productId: prod("Vaseline").id, qty: 10, unitCost: 168 },
  ];
  const po3Sub = po3Items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  await db.purchaseOrder.create({
    data: {
      no: "PO-0003", supplierId: suppliers[2].id, branchId: brMain.id, userId: uAdmin.id,
      status: "DRAFT" as PurchaseOrderStatus, subtotal: po3Sub, total: po3Sub,
      createdAt: daysAgo(1, 15), items: { create: po3Items.map((i) => ({ ...i, receivedQty: 0 })) },
    },
  });

  console.log("💰 الفواتير التاريخية (آخر 45 يوم)...");
  const saleProds = ["Panadol", "Adol", "Cetal", "Brufen", "Nurofen", "Aspocid", "Warin", "Augmentin", "Zinnat", "Ciproxin", "Flagyl", "Voltaren", "Cataflam", "Concor", "Glucophage", "Amlor", "Ventolin", "Otrivin", "Telfast", "Fucidin", "Omez", "Vitamin", "Omega", "Accu", "Masks", "Syringes", "Vaseline", "Bebelac"].map((s) => prod(s));
  // خطة FEFO افتراضية للتاريخية (أكبر من الرصيد الحقيقي لضمان تغطية المبيعات)
  const fefoMap: Record<string, any[]> = {};
  for (const b of batches) {
    const key = `${b.productId}-${b.branchId}`;
    (fefoMap[key] ||= []).push(b);
  }
  Object.values(fefoMap).forEach((arr: any[]) => arr.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime()));
  const remaining: Record<string, number> = {};
  for (const [key, arr] of Object.entries(fefoMap)) {
    remaining[key] = arr.reduce((s, b) => s + b.quantity, 0) * 3 + 40;
  }

  let invSeq = 1;
  const methods: PaymentMethod[] = ["CASH", "CASH", "CASH", "CASH", "VISA", "VISA", "WALLET", "CREDIT", "INSURANCE"];
  let cashYesterday = 0;
  for (let day = 45; day >= 0; day--) {
    const nInvoices = day <= 1 ? 6 : randInt(2, 5);
    for (let k = 0; k < nInvoices; k++) {
      const hour = randInt(9, 21);
      const date = daysAgo(day, hour);
      const branch = rand() < 0.7 ? brMain : brNasr;
      const customer = rand() < 0.55 ? pick(customers) : null;
      const user = rand() < 0.8 ? uCashier : uPharma;
      const nItems = randInt(1, 4);
      const lines: any[] = [];
      const usedIds = new Set<string>();
      for (let i = 0; i < nItems; i++) {
        const p = pick(saleProds);
        if (usedIds.has(p.id)) continue;
        usedIds.add(p.id);
        const key = `${p.id}-${branch.id}`;
        if (!fefoMap[key] || remaining[key] < 2) continue;
        const qty = randInt(1, 3);
        remaining[key] -= qty;
        const bArr = fefoMap[key];
        let chosen = bArr[0];
        for (const b of bArr) {
          if (b.expiryDate.getTime() > date.getTime()) { chosen = b; break; }
        }
        const disc = rand() < 0.15 ? round2(p.sellPrice * qty * 0.05) : 0;
        const net = p.sellPrice * qty - disc;
        lines.push({
          productId: p.id, batchId: chosen.id, name: p.tradeName, qty,
          unitPrice: p.sellPrice, discount: disc, taxRate: p.taxRate,
          taxAmount: round2((net * p.taxRate) / 100), total: round2(net * (1 + p.taxRate / 100)),
          costPrice: chosen.costPrice,
        });
      }
      if (!lines.length) continue;
      const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0));
      const itemDiscount = round2(lines.reduce((s, l) => s + l.discount, 0));
      const tax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
      const method = pick(methods);
      const invDiscount = rand() < 0.1 ? round2((subtotal - itemDiscount) * 0.02) : 0;
      const total = round2(subtotal - itemDiscount - invDiscount + tax);
      const status = rand() < 0.02 && day > 2 ? ("PARTIALLY_REFUNDED" as InvoiceStatus) : ("COMPLETED" as InvoiceStatus);
      const no = `INV-${String(invSeq++).padStart(5, "0")}`;
      const earned = Math.floor(total / 50);
      const inv = await db.invoice.create({
        data: {
          no, type: "SALE", status, customerId: customer?.id ?? null, userId: user.id, branchId: branch.id,
          subtotal, itemDiscount, invoiceDiscount: invDiscount, tax, total, paid: total, changeDue: 0,
          paymentMethod: method, loyaltyPointsEarned: earned, eInvoiceUuid: crypto.randomUUID(),
          createdAt: date, items: { create: lines },
        },
      });
      for (const l of lines) {
        await db.stockMovement.create({
          data: { productId: l.productId, batchId: l.batchId, branchId: branch.id, type: "SALE" as MovementType, quantity: -l.qty, refType: "INVOICE", refId: inv.no, userId: user.id, createdAt: date },
        });
      }
      if (customer && earned > 0) await db.customer.update({ where: { id: customer.id }, data: { loyaltyPoints: { increment: earned } } });
      if (method === "CREDIT" && customer) await db.customer.update({ where: { id: customer.id }, data: { creditBalance: { increment: total } } });
      if (day <= 1 && method === "CASH") cashYesterday += total;

      if (status === "PARTIALLY_REFUNDED" && lines.length) {
        const l = lines[0];
        const refSub = round2(l.unitPrice * 1);
        const refTax = round2((refSub * l.taxRate) / 100);
        await db.invoice.create({
          data: {
            no: `INV-${String(invSeq++).padStart(5, "0")}`, type: "RETURN", status: "COMPLETED",
            customerId: customer?.id ?? null, userId: user.id, branchId: branch.id,
            subtotal: refSub, itemDiscount: 0, invoiceDiscount: 0, tax: refTax, total: round2(refSub + refTax),
            paid: round2(refSub + refTax), paymentMethod: "CASH", originalInvoiceId: inv.id,
            eInvoiceUuid: crypto.randomUUID(), createdAt: new Date(date.getTime() + 3 * 3600 * 1000),
            items: { create: [{ ...l, qty: 1, taxAmount: refTax, total: round2(refSub + refTax) }] },
          },
        });
        await db.stockMovement.create({ data: { productId: l.productId, batchId: l.batchId, branchId: branch.id, type: "SALE_REFUND" as MovementType, quantity: 1, refType: "INVOICE", refId: inv.no, userId: user.id, createdAt: new Date(date.getTime() + 3 * 3600 * 1000) } });
      }
    }
  }

  console.log("📋 الوصفات الطبية...");
  await db.prescription.create({
    data: {
      no: "RX-0001", customerId: customers[1].id, doctorId: doctors[2].id, branchId: brMain.id, userId: uPharma.id,
      status: "PENDING" as PrescriptionStatus, source: "MANUAL", notes: "متابعة ضغط — مراجعة بعد أسبوعين", createdAt: daysAgo(0, 10),
      items: { create: [
        { productId: prod("Concor").id, productName: prod("Concor").tradeName, dosage: "قرص صباحاً", qty: 2, dispensedQty: 0 },
        { productId: prod("Glucophage").id, productName: prod("Glucophage").tradeName, dosage: "قرص بعد العشاء", qty: 1, dispensedQty: 0 },
      ] },
    },
  });
  await db.prescription.create({
    data: {
      no: "RX-0002", customerId: customers[2].id, doctorId: doctors[0].id, branchId: brMain.id, userId: uPharma.id,
      status: "PENDING" as PrescriptionStatus, source: "IMAGE", notes: "صورة وصفة مرفقة — تحليل + أدوية", createdAt: daysAgo(1, 17),
      items: { create: [
        { productId: prod("Augmentin").id, productName: prod("Augmentin").tradeName, dosage: "قرص كل 12 ساعة", qty: 2, dispensedQty: 0 },
        { productId: prod("Omez").id, productName: prod("Omez").tradeName, dosage: "كبسولة قبل الأكل", qty: 1, dispensedQty: 0 },
      ] },
    },
  });
  await db.prescription.create({
    data: {
      no: "RX-0003", customerId: customers[5].id, doctorId: doctors[1].id, branchId: brMain.id, userId: uPharma.id,
      status: "DISPENSED" as PrescriptionStatus, source: "MANUAL", notes: "روبة ربو", createdAt: daysAgo(6, 12),
      items: { create: [
        { productId: prod("Ventolin").id, productName: prod("Ventolin").tradeName, dosage: "جرعتين عند اللزوم", qty: 1, dispensedQty: 1 },
      ] },
    },
  });

  console.log("💵 الورديات والمصروفات...");
  await db.shift.create({
    data: {
      userId: uCashier.id, branchId: brMain.id, openingBalance: 500,
      closingBalance: round2(500 + cashYesterday - 80), expectedBalance: round2(500 + cashYesterday - 80),
      variance: 0, status: "CLOSED", notes: "وردية مساء — لا فروقات", openedAt: daysAgo(1, 9), closedAt: daysAgo(1, 22),
    },
  });
  const expenseData: Array<[string, string, number, number, string]> = [
    ["EXPENSE", "إيجار", 8000, 40, "إيجار فرع المعادي — نوفمبر"],
    ["EXPENSE", "كهرباء ومياه", 1250, 38, ""],
    ["EXPENSE", "رواتب", 24000, 30, "رواتب نوفمبر مقدمة"],
    ["EXPENSE", "صيانة", 600, 12, "صيانة مكيف الصيدلية"],
    ["EXPENSE", "مستلزمات مكتبية", 180, 5, ""],
    ["INCOME", "إيراد متنوع", 350, 8, "بيع كراتين فاضية"],
  ];
  for (const [type, category, amount, dago, note] of expenseData) {
    await db.expense.create({ data: { type, category, amount, note, userId: uAcc.id, branchId: brMain.id, createdAt: daysAgo(dago, 11) } });
  }

  console.log("🧑‍💼 الموارد البشرية...");
  const empData: Array<[string, string, string, number, string | null]> = [
    ["أحمد عبد الرحمن", "مدير الصيدلية", "01001234567", 18000, uAdmin.id],
    ["د. سارة محمود", "صيدلي أول", "01012345678", 12000, uPharma.id],
    ["محمد سعيد", "كاشير", "01023456789", 6000, uCashier.id],
    ["خالد يوسف", "محاسب", "01034567890", 9000, uAcc.id],
    ["مصطفى كامل", "مسؤول مخزون", "01045678901", 7000, uInv.id],
    ["أميرة رشاد", "مساعد صيدلي", "01056789012", 4500, null],
  ];
  const employees: any[] = [];
  for (const [name, position, phone, salary, userId] of empData) {
    employees.push(await db.employee.create({ data: { name, position, phone, salary, userId, hireDate: daysAgo(randInt(200, 900)) } }));
  }
  for (let d = 1; d <= 3; d++) {
    for (const e of employees) {
      const late = rand() < 0.15;
      await db.attendance.create({
        data: { employeeId: e.id, date: daysAgo(d, 8), status: late ? "LATE" : "PRESENT", checkIn: daysAgo(d, late ? 9 : 8), checkOut: daysAgo(d, 17) },
      });
    }
  }
  await db.payroll.create({ data: { employeeId: employees[2].id, month: "2026-10", baseSalary: 6000, deductions: 0, bonuses: 500, netPaid: 6500, paidAt: daysAgo(30, 12) } });

  console.log("⚙️ الإعدادات...");
  await db.settings.upsert({
    where: { id: "main" },
    update: {},
    create: {
      id: "main",
      pharmacyName: "صيدلية الشفاء", pharmacyNameEn: "Al-Shifaa Pharmacy",
      commercialReg: "102354", taxNumber: "555-123-456",
      licenseNumber: "EG-PH-2024-5521", licenseExpiry: new Date("2027-06-30"),
      address: "شارع 9، المعادي، القاهرة، مصر", phone: "0225216789", email: "info@alshifaa-pharma.eg",
      currency: "EGP", defaultTaxRate: 14,
      invoicePrefix: "INV-", nextInvoiceSeq: invSeq, nextPOSeq: 4, nextGRNSeq: 2, nextRxSeq: 4,
      invoiceHeader: "شكراً لتعاملكم مع صيدلية الشفاء",
      invoiceFooter: "الاستبدال خلال 14 يوم بالفاتورة الأصلية — الأدوية لا تُستبدل إلا بحالة سليمة",
      invoiceTerms: "تُصدر هذه الفاتورة إلكترونياً ومسجلة لدى مصلحة الضرائب المصرية",
      defaultPaymentMethod: "CASH", printerType: "THERMAL",
      loyaltyEnabled: true, loyaltyEarnRate: 50, loyaltyRedeemRate: 0.25,
      cashierMaxDiscount: 10,
      defaultReorderPoint: 10, expiryAlertDays: "90,30,7", stockMethod: "FEFO",
      alertLowStock: true, alertExpiry: true, alertPendingRx: true,
      notifyInApp: true, notifyEmail: true, notifySms: false, notifyWhatsapp: true,
      backupSchedule: "DAILY", backupLocation: "LOCAL", lastBackupAt: daysAgo(0, 3),
      theme: "SYSTEM", language: "AR", primaryColor: "emerald",
      etaClientId: "STG-ETA-CLIENT-77121", etaSecret: "••••••••", whatsappToken: "••••••••", smsProvider: "Vodafone SMS GW",
      updatedAt: daysAgo(0, 3),
    },
  });

  console.log("🔔 التنبيهات...");
  await db.notification.create({ data: { type: "EXPIRY", severity: "CRITICAL", title: "أدوية منتهية الصلاحية", message: "فولتارين 50 مجم — تشغيلة VT2501 منتهية (8 علبة بالفرع الرئيسي) — يجب سحبها من الأرفف فوراً", refType: "BATCH", isRead: false } });
  await db.notification.create({ data: { type: "EXPIRY", severity: "WARNING", title: "صلاحية أقل من شهر", message: "بانادول إكسترا — تشغيلة PN2501B تنتهي خلال 18 يوم (30 علبة)", refType: "BATCH", isRead: false } });
  await db.notification.create({ data: { type: "EXPIRY", severity: "WARNING", title: "صلاحية أقل من أسبوع", message: "بروفين 400 مجم — تشغيلة BF2502 تنتهي خلال 8 أيام (26 علبة)", refType: "BATCH", isRead: false } });
  await db.notification.create({ data: { type: "LOW_STOCK", severity: "WARNING", title: "مخزون تحت حد إعادة الطلب", message: "أملور 5 مجم — المتبقي 4 علبة (حد الطلب 15) — يوجد أمر شراء PO-0002", refType: "PRODUCT", isRead: false } });
  await db.notification.create({ data: { type: "LOW_STOCK", severity: "WARNING", title: "مخزون تحت الحد الأدنى", message: "سيتال 500 مجم — المتبقي 12 علبة (الحد الأدنى 30)", refType: "PRODUCT", isRead: false } });
  await db.notification.create({ data: { type: "PENDING_RX", severity: "INFO", title: "وصفات معلقة", message: "الوصفة RX-0001 (د. حسام فؤاد) للعميل فاطمة عبد الله بانتظار الصرف", refType: "PRESCRIPTION", isRead: false } });
  await db.notification.create({ data: { type: "BACKUP", severity: "INFO", title: "النسخ الاحتياطي مكتمل", message: "نجح النسخ الاحتياطي اليومي — الحجم 2.4 ميجابايت — الموقع: محلي", isRead: true, createdAt: daysAgo(0, 3) } });

  console.log("📝 سجل العمليات...");
  await db.auditLog.create({ data: { userId: uAdmin.id, userName: "أحمد عبد الرحمن", action: "SETTINGS_UPDATE", entity: "Settings", entityId: "main", details: "تحديث نسبة الخصم المسموح للكاشير إلى 10٪", createdAt: daysAgo(2, 10) } });
  await db.auditLog.create({ data: { userId: uInv.id, userName: "مصطفى كامل", action: "GRN_RECEIVE", entity: "GoodsReceipt", entityId: "GRN-0001", details: "استلام أمر شراء PO-0001 من ابن سينا فارما", createdAt: daysAgo(20, 13) } });
  await db.auditLog.create({ data: { userId: uCashier.id, userName: "محمد سعيد", action: "LOGIN", entity: "Auth", details: "دخول بـ PIN — فرع المعادي", createdAt: daysAgo(1, 9) } });
  await db.auditLog.create({ data: { userId: uAcc.id, userName: "خالد يوسف", action: "EXPENSE_CREATE", entity: "Expense", details: "مصروف صيانة — 600 جنيه", createdAt: daysAgo(12, 11) } });

  console.log("✅ اكتملت البيانات التجريبية!");
  console.log(`   المنتجات: ${products.length} | التشغيلات: ${batchPlans.length} | الفواتير: ${invSeq - 1}`);
}

/**
 * البذر المحمي — نقطة الدخول الآمنة:
 * يتحقق من جدول User أولاً، ويبذر فقط عندما تكون القاعدة فارغة تماماً.
 * الـ transaction يضمن عدم ترك قاعدة شبه مهيأة عند فشل جزئي (rollback كامل)،
 * وإعادة الفحص داخل الـ transaction تحمي من التزامن (تشغيلان متوازيان).
 * @returns true إذا تم البذر الآن، false إذا كانت البيانات موجودة (لم يفعل شيئاً)
 */
export async function seedIfEmpty(db: PrismaClient): Promise<boolean> {
  const count = await db.user.count();
  if (count > 0) return false;
  console.log("🌱 قاعدة بيانات فارغة — بدء البذر...");
  await db.$transaction(
    async (tx) => {
      // إعادة الفحص داخل المعاملة — حماية من التزامن
      if ((await tx.user.count()) > 0) {
        console.log("⏭️ تهيّأت من عملية أخرى — تخطي");
        return;
      }
      await seedDatabase(tx);
    },
    { timeout: 180_000, maxWait: 20_000 }
  );
  return true;
}

// ─── التشغيل المباشر (prisma db seed / tsx prisma/seed.ts) ───
const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invoked && import.meta.url === invoked) {
  const db = new PrismaClient();
  seedIfEmpty(db)
    .then((seeded) => console.log(seeded ? "✅ تمت تهيئة قاعدة البيانات" : "⏭️ القاعدة تحتوي بيانات — لم يُنفَّذ أي شيء"))
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}

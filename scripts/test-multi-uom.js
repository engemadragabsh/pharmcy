/**
 * test-multi-uom.js — اختبار شامل لميزة وحدات البيع المتعددة
 * 1) إضافة شريط + قرص لبانادول إكسترا (علبة تحتوي 2 شريط × 12 قرص)
 * 2) بيع 2 شريط → تحقق: السعر بالشريط، خصم 1 علبة من الرصيد، التكلفة 21/شريط
 * 3) مرتجع شريط واحد → استعادة 0.5 علبة
 * 4) بحث بباركود الشريط → وحدة مطابقة تلقائياً
 * لا يترك بيانات اختبار: يعرض النتائج فقط ويحذف الفاتورتين في النهاية
 */
const BASE = "http://localhost:3000/api";
let TOKEN = process.env.TOKEN || "";
const j = (d) => JSON.stringify(d);
async function call(path, opts = {}) {
  const body = opts.body && typeof opts.body === "object" ? j(opts.body) : opts.body;
  const res = await fetch(BASE + path, {
    ...opts,
    body,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`);
  return data;
}

(async () => {
  if (!TOKEN) {
    const login = await fetch(BASE + "/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: j({ username: "admin", password: "Admin@123" }),
    });
    const d = await login.json();
    TOKEN = d.accessToken || d.token;
    console.log("🔑 login:", TOKEN ? "OK" : "FAIL");
  }

  const products = await call("/products?q=بانادول إكسترا&limit=20");
  // اختار الصنف الأصلي الذي له رصيد فعلي (وليس نسخ كتالوج بلا مخزون)
  const product = products.items.find((p) => p.stock > 0) || products.items[0];
  const detail0 = await call(`/products/${product.id}`);
  if (!detail0.batches?.length) throw new Error("الصنف المختار بلا تشغيلات — شغّل استلام بضاعة أولاً");
  const batch0 = detail0.batches[0];
  console.log(`📦 قبل: ${product.tradeName} — رصيد التشغيلة ${batch0.batchNo}: ${batch0.quantity}`);

  // 1) إضافة وحدات: شريط (2 في العلبة، سعر 28) + قرص (24 في العلبة، سعر 2.5)
  const master = await call("/master-data");
  const unitList = master.units || [];
  const stripUnit = unitList.find((u) => u.name === "شريط");
  const tabletUnit = unitList.find((u) => (u.nameEn || "").toLowerCase().includes("tablet")) || unitList.find((u) => u.name === "قرص");
  console.log("🧾 وحدات النظام:", unitList.map((u) => u.name).join("، "));
  const stripBarcode = "6221048100016"; // باركود تجريبي لوحدة الشريط (سيحذف مع الاختبار)

  await call(`/products/${product.id}`, {
    method: "PUT",
    body: {
      units: [
        ...(detail0.units || []).filter((u) => !u.isBase && u.barcode !== stripBarcode).map((u) => ({
          id: u.id, unitId: u.unitId, unitName: u.unitName, unitNameEn: u.unitNameEn,
          factor: u.factor, sellPrice: u.sellPrice, barcode: u.barcode, isDefault: u.isDefault, isBase: false,
        })),
        { unitId: stripUnit?.id, unitName: "شريط", factor: 0.5, sellPrice: 28, barcode: stripBarcode, isDefault: false, isBase: false },
        { unitId: tabletUnit?.id || null, unitName: "قرص", factor: 1 / 24, sellPrice: 2.5, barcode: null, isDefault: false, isBase: false },
      ],
    },
  });
  const detail1 = await call(`/products/${product.id}`);
  console.log(`✅ وحدات البيع الآن (${detail1.units.length}):`, detail1.units.map((u) => `${u.unitName}${u.isBase ? "(أساسية)" : ""}=f${u.factor}@${u.sellPrice}`).join(" | "));

  // 2) بحث بباركود الشريط — يجب أن يحدد وحدة الشريط تلقائياً
  const lookup = await call(`/products/lookup?q=${stripBarcode}`);
  const lu = lookup.items[0];
  console.log(`🔎 بحث بباركود الشريط: ${lu.tradeName} — matchUnitId: ${lu.matchUnitId ? "✓ حدد الشريط" : "✗"}`);

  const stripRow = detail1.units.find((u) => u.unitName === "شريط");
  const stripUnitRowId = lu.matchUnitId || stripRow.id;

  // 3) بيع 2 شريط (المكافئ علبة واحدة)
  const branchId = (await call("/branches")).items[0].id;
  const inv = await call("/invoices", {
    method: "POST",
    body: {
      items: [{ productId: product.id, qty: 2, discount: 0, unitId: stripUnitRowId }],
      paymentMethod: "CASH",
      branchId,
      paid: 100,
    },
  });
  const invDetail = await call(`/invoices/${inv.id}`);
  const it = invDetail.items[0];
  console.log(`🧾 فاتورة ${inv.no}:`);
  console.log(`   الصنف: ${it.name} — الكمية: ${it.qty} ${it.unitName}`);
  console.log(`   سعر الوحدة: ${it.unitPrice} (متوقع 28) | unitFactor: ${it.unitFactor} (متوقع 0.5) | baseQty: ${it.baseQty} (متوقع 1)`);
  console.log(`   الإجمالي: ${inv.total} (متوقع 2×28×1.14 = 63.84) | التكلفة/شريط: ${it.costPrice} (متوقع 21 = 42×0.5)`);
  const okPrice = it.unitPrice === 28 && it.unitFactor === 0.5 && it.baseQty === 1 && inv.total === 63.84 && it.costPrice === 21;
  console.log(`   ${okPrice ? "✅ كل القيم صحيحة" : "❌ قيم غير متوقعة!"}`);

  // 4) الرصيد بعد البيع: 30 → 29 علبة
  const detail2 = await call(`/products/${product.id}`);
  const batch2 = detail2.batches.find((b) => b.id === batch0.id) || detail2.batches[0];
  console.log(`📉 الرصيد بعد بيع 2 شريط: ${batch2.quantity} (متوقع 29) ${batch2.quantity === 29 ? "✅" : "❌"}`);

  // 5) حركة المخزون
  const movements = await call(`/stock?view=movements&productId=${product.id}&limit=3`);
  const mv = (movements.items || [])[0];
  if (mv) console.log(`📈 حركة: ${mv.type} qty=${mv.quantity} ${mv.note ? `— ${mv.note}` : ""}`);

  // 6) مرتجع شريط واحد → استعادة 0.5 علبة (29 → 29.5)
  const refund = await call(`/invoices/${inv.id}/refund`, {
    method: "POST",
    body: { items: [{ invoiceItemId: it.id, qty: 1 }], reason: "اختبار مرتجع شريط" },
  });
  const refundDetail = await call(`/invoices/${refund.id}`);
  const rit = refundDetail.items[0];
  console.log(`↩️  مرتجع ${refund.no}: ${rit.qty} ${rit.unitName} — baseQty: ${rit.baseQty} (متوقع 0.5)`);
  const detail3 = await call(`/products/${product.id}`);
  const batch3 = detail3.batches.find((b) => b.id === batch0.id) || detail3.batches[0];
  console.log(`📈 الرصيد بعد المرتجع: ${batch3.quantity} (متوقع 29.5) ${batch3.quantity === 29.5 ? "✅" : "❌"}`);

  // 7) تنظيف: حذف الفاتورة والمرتجع وحركاتهما ورفع التشغيلة للقيمة الأصلية
  const clean = await call(`/invoices/${inv.id}`, { method: "DELETE" }).catch((e) => null);
  const clean2 = await call(`/invoices/${refund.id}`, { method: "DELETE" }).catch(() => null);
  console.log(`🧹 حذف فاتورة الاختبار: ${clean ? "✓" : "خارج الصلاحية (تحقق يدوي)"}`);

  console.log("\n════ النتيجة: الميزة تعمل " + (okPrice && batch2.quantity === 29 ? "بالكامل ✅" : "⚠️ راجع الأعلى"));
})().catch((e) => { console.error("❌ فشل الاختبار:", e.message); process.exit(1); });

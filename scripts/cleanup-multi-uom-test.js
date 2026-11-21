/**
 * cleanup-multi-uom-test.js — تنظيف بيانات اختبار Multi-UoM
 * حذف فاتورة الاختبار ومرتجعها وحركاتهما وسجلات التدقيق المرتبطة
 * إعادة التشغيلة PN2501B إلى 30 علبة + ترقيم الفواتير
 * حذف صف الوحدة المكرر (شريط بدون unitId) مع الإبقاء على صفين العرض: شريط + قرص
 */
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const nos = ["INV-00145", "INV-00146"];
  const invoices = await db.invoice.findMany({ where: { no: { in: nos } }, include: { items: true } });
  console.log("فواتير الاختبار:", invoices.map((i) => `${i.no}(${i.type})`).join("، ") || "لا شيء");

  for (const inv of invoices) {
    await db.stockMovement.deleteMany({ where: { refId: inv.no, refType: { in: ["INVOICE", "RETURN"] } } });
    await db.auditLog.deleteMany({ where: { entity: "Invoice", entityId: inv.id } });
    await db.auditLog.deleteMany({ where: { action: { in: ["SALE", "REFUND"] }, details: { contains: inv.no } } });
    await db.invoiceItem.deleteMany({ where: { invoiceId: inv.id } });
    await db.invoice.delete({ where: { id: inv.id } });
    console.log("✓ حُذفت", inv.no);
  }

  // إعادة التشغيلة إلى 30 علبة (القيمة قبل الاختبار)
  const batch = await db.batch.findFirst({ where: { batchNo: "PN2501B" } });
  if (batch) {
    await db.batch.update({ where: { id: batch.id }, data: { quantity: 30 } });
    console.log(`✓ التشغيلة PN2501B أعيدت إلى 30 (كانت ${batch.quantity})`);
  }

  // ترقيم الفواتير: التالي = أعلى رقم موجود + 1
  const allInvoices = await db.invoice.findMany({ select: { no: true } });
  const maxSeq = allInvoices.reduce((mx, i) => {
    const m = i.no.match(/(\d+)\s*$/);
    return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
  }, 0);
  const s = await db.settings.findUnique({ where: { id: "main" } });
  await db.settings.update({ where: { id: "main" }, data: { nextInvoiceSeq: maxSeq + 1 } });
  console.log(`✓ ترقيم الفواتير التالي: INV-${String(maxSeq + 1).padStart(5, "0")} (كان ${s?.nextInvoiceSeq})`);

  // حذف صف الوحدة المكرر (شريط بدون unitId — من اختبار curl المبكر)
  const dupRows = await db.productUnit.findMany({
    where: { unitName: "شريط", unitId: null, isBase: false },
    include: { product: { select: { tradeName: true } } },
  });
  for (const r of dupRows) {
    await db.productUnit.delete({ where: { id: r.id } });
    console.log("✓ حُذف صف الوحدة المكرر من", r.product.tradeName);
  }

  // تحقق نهائي
  const invCount = await db.invoice.count({ where: { no: { in: nos } } });
  const units = await db.productUnit.findMany({
    where: { product: { barcode: "6221048100015" } },
    orderBy: [{ isBase: "desc" }, { factor: "desc" }],
  });
  console.log("—— تحقق نهائي ——");
  console.log("فواتير الاختبار المتبقية:", invCount);
  console.log("رصيد التشغيلة:", (await db.batch.findFirst({ where: { batchNo: "PN2501B" } })).quantity);
  console.log("وحدات بانادول:", units.map((u) => `${u.unitName}${u.isBase ? "(أساسية)" : ""}=f${u.factor}@${u.sellPrice}${u.barcode ? " bc:" + u.barcode : ""}`).join(" | "));
}

main()
  .catch((e) => { console.error("❌ فشل:", e); process.exit(1); })
  .finally(() => db.$disconnect());

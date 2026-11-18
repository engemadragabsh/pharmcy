import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { round2 } from "@/lib/server/core";

/** التقارير الموحدة — type يحدد نوع التقرير */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "sales-daily";
    const branchId = searchParams.get("branchId") || undefined;
    const userId = searchParams.get("userId") || undefined;
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    defaultFrom.setHours(0, 0, 0, 0);
    const from = dateFrom ? new Date(dateFrom) : defaultFrom;
    const to = dateTo ? new Date(dateTo) : new Date();
    if (dateTo) to.setHours(23, 59, 59, 999);

    const saleWhere: any = { type: "SALE", status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] }, createdAt: { gte: from, lte: to } };
    if (branchId) saleWhere.branchId = branchId;
    if (userId) saleWhere.userId = userId;

    // ── مبيعات يومية ──
    if (type === "sales-daily") {
      const invoices = await db.invoice.findMany({ where: saleWhere, select: { total: true, tax: true, createdAt: true, paymentMethod: true } });
      const map = new Map<string, { date: string; total: number; count: number; tax: number }>();
      for (const inv of invoices) {
        const key = inv.createdAt.toISOString().slice(0, 10);
        const cur = map.get(key) || { date: key, total: 0, count: 0, tax: 0 };
        cur.total += inv.total;
        cur.tax += inv.tax;
        cur.count += 1;
        map.set(key, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.date.localeCompare(a.date)).map((r) => ({ ...r, total: round2(r.total), tax: round2(r.tax) }));
      const summary = { totalSales: round2(rows.reduce((s, r) => s + r.total, 0)), totalInvoices: rows.reduce((s, r) => s + r.count, 0), avgPerDay: rows.length ? round2(rows.reduce((s, r) => s + r.total, 0) / rows.length) : 0, totalTax: round2(rows.reduce((s, r) => s + r.tax, 0)) };
      return NextResponse.json({ type, rows, summary });
    }

    // ── مبيعات حسب المستخدم/الفرع ──
    if (type === "sales-by-user" || type === "sales-by-branch") {
      const invoices: any[] = await db.invoice.findMany({
        where: saleWhere,
        include: type === "sales-by-user" ? { user: { select: { fullName: true } } } : { branch: { select: { name: true } } },
      });
      const map = new Map<string, { name: string; total: number; count: number }>();
      for (const inv of invoices) {
        const key = type === "sales-by-user" ? inv.userId : inv.branchId;
        const name = type === "sales-by-user" ? inv.user.fullName : inv.branch.name;
        const cur = map.get(key) || { name, total: 0, count: 0 };
        cur.total += inv.total;
        cur.count += 1;
        map.set(key, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.total - a.total).map((r) => ({ ...r, total: round2(r.total) }));
      return NextResponse.json({ type, rows, summary: { totalSales: round2(rows.reduce((s, r) => s + r.total, 0)), totalInvoices: rows.reduce((s, r) => s + r.count, 0) } });
    }

    // ── الأرباح وهوامش الربح ──
    if (type === "profit") {
      const items = await db.invoiceItem.findMany({
        where: { invoice: saleWhere },
        include: { product: { select: { tradeName: true, tradeNameEn: true } } },
      });
      const map = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
      for (const it of items) {
        const key = it.productId || it.name;
        const cur = map.get(key) || { name: it.name, qty: 0, revenue: 0, cost: 0 };
        cur.qty += it.qty;
        cur.revenue += it.total - it.taxAmount;
        cur.cost += it.costPrice * it.qty;
        map.set(key, cur);
      }
      const rows = [...map.values()].map((r) => ({
        ...r, revenue: round2(r.revenue), cost: round2(r.cost),
        profit: round2(r.revenue - r.cost),
        margin: r.revenue > 0 ? Math.round(((r.revenue - r.cost) / r.revenue) * 100) : 0,
      })).sort((a, b) => b.profit - a.profit).slice(0, 30);
      const summary = { totalRevenue: round2(rows.reduce((s, r) => s + r.revenue, 0)), totalCost: round2(rows.reduce((s, r) => s + r.cost, 0)), totalProfit: round2(rows.reduce((s, r) => s + r.profit, 0)) };
      return NextResponse.json({ type, rows, summary });
    }

    // ── المخزون: نواقص ──
    if (type === "inventory-low") {
      const batches = await db.batch.findMany({ where: { quantity: { gt: 0 }, ...(branchId ? { branchId } : {}) } });
      const products = await db.product.findMany({ where: { isActive: true } });
      const stockMap = new Map<string, number>();
      for (const b of batches) stockMap.set(b.productId, (stockMap.get(b.productId) || 0) + b.quantity);
      const rows = products.filter((p) => (stockMap.get(p.id) || 0) <= p.reorderPoint).map((p) => ({
        name: p.tradeName, tradeNameEn: p.tradeNameEn, qty: stockMap.get(p.id) || 0, reorderPoint: p.reorderPoint, minStock: p.minStock, purchasePrice: p.purchasePrice,
        status: (stockMap.get(p.id) || 0) === 0 ? "نفد" : "تحت الحد الأدنى",
      }));
      return NextResponse.json({ type, rows, summary: { count: rows.length, outOfStock: rows.filter((r) => r.qty === 0).length } });
    }

    // ── المخزون: قارب الانتهاء ──
    if (type === "inventory-expiring") {
      const days = parseInt(searchParams.get("days") || "90");
      const limit = new Date(Date.now() + days * 86400000);
      const batches = await db.batch.findMany({
        where: { expiryDate: { lte: limit }, quantity: { gt: 0 }, ...(branchId ? { branchId } : {}) },
        include: { product: { select: { tradeName: true, tradeNameEn: true } }, branch: { select: { name: true } } },
        orderBy: { expiryDate: "asc" },
      });
      const rows = batches.map((b) => ({
        name: b.product.tradeName, batchNo: b.batchNo, branch: b.branch.name,
        expiry: b.expiryDate.toISOString().slice(0, 10), days: Math.ceil((b.expiryDate.getTime() - Date.now()) / 86400000),
        qty: b.quantity, value: round2(b.quantity * b.costPrice),
        expired: b.expiryDate.getTime() < Date.now(),
      }));
      return NextResponse.json({ type, rows, summary: { count: rows.length, expired: rows.filter((r) => r.expired).length, valueAtRisk: round2(rows.reduce((s, r) => s + r.value, 0)) } });
    }

    // ── الأبطأ حركة (Slow Movers) ──
    if (type === "slow-movers") {
      const items30 = await db.invoiceItem.findMany({
        where: { invoice: { ...saleWhere } },
        select: { productId: true, qty: true },
      });
      const soldMap = new Map<string, number>();
      for (const it of items30) if (it.productId) soldMap.set(it.productId, (soldMap.get(it.productId) || 0) + it.qty);
      const products = await db.product.findMany({ where: { isActive: true }, include: { batches: true } });
      const rows = products.map((p) => ({
        name: p.tradeName, tradeNameEn: p.tradeNameEn,
        soldQty30d: soldMap.get(p.id) || 0,
        stockQty: p.batches.reduce((s, b) => s + b.quantity, 0),
        stockValue: round2(p.batches.reduce((s, b) => s + b.quantity * b.costPrice, 0)),
        rotation: p.batches.length && soldMap.get(p.id) ? "دوران طبيعي" : soldMap.get(p.id) ? "بطيء" : "راكد",
      })).filter((r) => r.stockQty > 0).sort((a, b) => a.soldQty30d - b.soldQty30d).slice(0, 30);
      return NextResponse.json({ type, rows, summary: { stagnant: rows.filter((r) => r.rotation === "راكد").length, slow: rows.filter((r) => r.rotation === "بطيء").length, value: round2(rows.reduce((s, r) => s + r.stockValue, 0)) } });
    }

    // ── الضريبة ──
    if (type === "vat") {
      const invoices = await db.invoice.findMany({ where: saleWhere, select: { total: true, tax: true, itemDiscount: true, invoiceDiscount: true, subtotal: true, createdAt: true } });
      const map = new Map<string, { month: string; sales: number; tax: number; count: number }>();
      for (const inv of invoices) {
        const key = `${inv.createdAt.getFullYear()}-${String(inv.createdAt.getMonth() + 1).padStart(2, "0")}`;
        const cur = map.get(key) || { month: key, sales: 0, tax: 0, count: 0 };
        cur.sales += inv.total;
        cur.tax += inv.tax;
        cur.count += 1;
        map.set(key, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.month.localeCompare(a.month)).map((r) => ({ ...r, sales: round2(r.sales), tax: round2(r.tax), net: round2(r.sales - r.tax) }));
      return NextResponse.json({ type, rows, summary: { totalSales: round2(rows.reduce((s, r) => s + r.sales, 0)), totalTax: round2(rows.reduce((s, r) => s + r.tax, 0)) } });
    }

    // ── أداء الكاشير ──
    if (type === "cashier-performance") {
      const invoices = await db.invoice.findMany({ where: saleWhere, include: { user: { select: { fullName: true } }, items: true } });
      const map = new Map<string, { name: string; invoices: number; total: number; items: number; discounts: number }>();
      for (const inv of invoices) {
        const cur = map.get(inv.userId) || { name: inv.user.fullName, invoices: 0, total: 0, items: 0, discounts: 0 };
        cur.invoices += 1;
        cur.total += inv.total;
        cur.items += inv.items.reduce((s, i) => s + i.qty, 0);
        cur.discounts += inv.itemDiscount + inv.invoiceDiscount;
        map.set(inv.userId, cur);
      }
      const rows = [...map.values()].map((r) => ({ ...r, total: round2(r.total), avgInvoice: r.invoices ? round2(r.total / r.invoices) : 0, discounts: round2(r.discounts) })).sort((a, b) => b.total - a.total);
      return NextResponse.json({ type, rows, summary: {} });
    }

    // ── الأكثر مبيعاً ──
    if (type === "top-products" || type === "top-customers") {
      if (type === "top-products") {
        const items = await db.invoiceItem.findMany({ where: { invoice: saleWhere }, select: { name: true, qty: true, total: true } });
        const map = new Map<string, { name: string; qty: number; revenue: number }>();
        for (const it of items) {
          const cur = map.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
          cur.qty += it.qty;
          cur.revenue += it.total;
          map.set(it.name, cur);
        }
        const rows = [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20).map((r) => ({ ...r, revenue: round2(r.revenue) }));
        return NextResponse.json({ type, rows, summary: { count: rows.length } });
      }
      const invoices = await db.invoice.findMany({ where: { ...saleWhere, customerId: { not: null } }, include: { customer: { select: { name: true, code: true, type: true } } } });
      const map = new Map<string, { name: string; code: string; type: string; total: number; count: number }>();
      for (const inv of invoices) {
        if (!inv.customer) continue;
        const cur = map.get(inv.customerId!) || { name: inv.customer.name, code: inv.customer.code, type: inv.customer.type, total: 0, count: 0 };
        cur.total += inv.total;
        cur.count += 1;
        map.set(inv.customerId!, cur);
      }
      const rows = [...map.values()].sort((a, b) => b.total - a.total).slice(0, 20).map((r) => ({ ...r, total: round2(r.total) }));
      return NextResponse.json({ type, rows, summary: { count: rows.length } });
    }

    throw new ApiError(400, "نوع التقرير غير معروف");
  } catch (e) {
    return handleApiError(e);
  }
}

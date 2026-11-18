import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/server/auth";
import { round2 } from "@/lib/server/core";

/** لوحة التحكم — مؤشرات الأداء + الرسوم + التنبيهات */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branchId") || undefined; // undefined = كل الفروع

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const start30 = new Date();
    start30.setDate(start30.getDate() - 30);

    const saleWhere: any = { type: "SALE", status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] }, ...(branchId ? { branchId } : {}) };

    // ── المؤشرات ──
    const [todayAgg, monthAgg, todayCount, pendingRx, openShift] = await Promise.all([
      db.invoice.aggregate({ _sum: { total: true }, where: { ...saleWhere, createdAt: { gte: startOfDay } } }),
      db.invoice.aggregate({ _sum: { total: true }, where: { ...saleWhere, createdAt: { gte: startOfMonth } } }),
      db.invoice.count({ where: { ...saleWhere, createdAt: { gte: startOfDay } } }),
      db.prescription.count({ where: { status: "PENDING" } }),
      db.shift.findFirst({ where: { status: "OPEN", ...(branchId ? { branchId } : {}) }, include: { user: true }, orderBy: { openedAt: "desc" } }),
    ]);

    // ── المخزون: نواقص وصلاحيات ──
    const batches = await db.batch.findMany({
      where: { ...(branchId ? { branchId } : {}), quantity: { gt: 0 } },
      include: { product: { select: { id: true, tradeName: true, tradeNameEn: true, reorderPoint: true, minStock: true, sellPrice: true } } },
    });
    const stockByProduct = new Map<string, number>();
    for (const b of batches) stockByProduct.set(b.productId, (stockByProduct.get(b.productId) || 0) + b.quantity);
    const productsForReorder = await db.product.findMany({ where: { isActive: true }, select: { id: true, tradeName: true, tradeNameEn: true, reorderPoint: true, minStock: true, sellPrice: true } });

    const lowStock = productsForReorder
      .filter((p) => (stockByProduct.get(p.id) || 0) < p.reorderPoint)
      .map((p) => ({ id: p.id, tradeName: p.tradeName, tradeNameEn: p.tradeNameEn, qty: stockByProduct.get(p.id) || 0, reorderPoint: p.reorderPoint, minStock: p.minStock }))
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 10);

    const now = Date.now();
    const expired = batches.filter((b) => b.expiryDate.getTime() < now);
    const expiringSoon = batches.filter((b) => {
      const diffDays = (b.expiryDate.getTime() - now) / 86400000;
      return diffDays >= 0 && diffDays <= 90;
    }).sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

    // ── الرسوم البيانية ──
    const invoices30 = await db.invoice.findMany({
      where: { ...saleWhere, createdAt: { gte: start30 } },
      select: { total: true, createdAt: true },
    });
    const sales14d: Array<{ date: string; total: number; count: number }> = [];
    for (let d = 13; d >= 0; d--) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      day.setHours(0, 0, 0, 0);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const dayInvoices = invoices30.filter((i) => i.createdAt >= day && i.createdAt < next);
      sales14d.push({ date: day.toISOString().slice(0, 10), total: round2(dayInvoices.reduce((s, i) => s + i.total, 0)), count: dayInvoices.length });
    }

    const sales12m: Array<{ month: string; total: number }> = [];
    for (let m = 11; m >= 0; m--) {
      const start = new Date();
      start.setMonth(start.getMonth() - m);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const agg = await db.invoice.aggregate({
        _sum: { total: true },
        where: { ...saleWhere, createdAt: { gte: start, lt: end } },
      });
      sales12m.push({ month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`, total: round2(agg._sum.total || 0) });
    }

    // الأكثر مبيعاً (آخر 30 يوم)
    const items30 = await db.invoiceItem.findMany({
      where: { invoice: { ...saleWhere, createdAt: { gte: start30 } } },
      select: { productId: true, name: true, qty: true, total: true },
    });
    const prodAgg = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items30) {
      if (!it.productId) continue;
      const cur = prodAgg.get(it.productId) || { name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty;
      cur.revenue += it.total;
      prodAgg.set(it.productId, cur);
    }
    const topProducts = [...prodAgg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8).map((v) => ({ ...v, revenue: round2(v.revenue) }));

    // أعلى العملاء (آخر 30 يوم)
    const inv30 = await db.invoice.findMany({
      where: { ...saleWhere, createdAt: { gte: start30 }, customerId: { not: null } },
      select: { customerId: true, total: true, customer: { select: { name: true, code: true } } },
    });
    const custAgg = new Map<string, { name: string; code: string; total: number; count: number }>();
    for (const i of inv30) {
      if (!i.customerId || !i.customer) continue;
      const cur = custAgg.get(i.customerId) || { name: i.customer.name, code: i.customer.code, total: 0, count: 0 };
      cur.total += i.total;
      cur.count += 1;
      custAgg.set(i.customerId, cur);
    }
    const topCustomers = [...custAgg.values()].sort((a, b) => b.total - a.total).slice(0, 5).map((v) => ({ ...v, total: round2(v.total) }));

    // ── الوصفات المعلقة ──
    const pendingRxList = await db.prescription.findMany({
      where: { status: "PENDING" },
      include: { customer: { select: { name: true } }, doctor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // ── أحدث الفواتير ──
    const recentInvoices = await db.invoice.findMany({
      where: { type: "SALE", ...(branchId ? { branchId } : {}) },
      include: { customer: { select: { name: true } }, user: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    // الخزينة الحالية
    let cashInDrawer = 0;
    if (openShift) {
      const cashToday = await db.invoice.aggregate({
        _sum: { total: true },
        where: { ...saleWhere, paymentMethod: "CASH", createdAt: { gte: openShift.openedAt } },
      });
      cashInDrawer = round2(openShift.openingBalance + (cashToday._sum.total || 0));
    }

    return NextResponse.json({
      kpis: {
        todaySales: round2(todayAgg._sum.total || 0),
        monthSales: round2(monthAgg._sum.total || 0),
        todayInvoices: todayCount,
        lowStockCount: productsForReorder.filter((p) => (stockByProduct.get(p.id) || 0) < p.reorderPoint).length,
        expiringCount: expiringSoon.length,
        expiredCount: expired.length,
        pendingRx,
        cashInDrawer,
      },
      charts: { sales14d, sales12m, topProducts, topCustomers },
      alerts: {
        lowStock,
        expired: expired.map((b) => ({ id: b.id, product: b.product.tradeName, batchNo: b.batchNo, expiry: b.expiryDate, qty: b.quantity })),
        expiring: expiringSoon.slice(0, 8).map((b) => ({ id: b.id, product: b.product.tradeName, batchNo: b.batchNo, expiry: b.expiryDate, qty: b.quantity, days: Math.floor((b.expiryDate.getTime() - now) / 86400000) })),
        pendingRx: pendingRxList.map((r) => ({ id: r.id, no: r.no, customer: r.customer?.name || "عميل نقدي", doctor: r.doctor?.name || "-", createdAt: r.createdAt })),
      },
      recentInvoices: recentInvoices.map((i) => ({
        id: i.id, no: i.no, total: i.total, status: i.status, paymentMethod: i.paymentMethod,
        customer: i.customer?.name || "عميل نقدي", cashier: i.user.fullName, createdAt: i.createdAt,
      })),
      openShift: openShift ? { id: openShift.id, user: openShift.user.fullName, openedAt: openShift.openedAt, openingBalance: openShift.openingBalance } : null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

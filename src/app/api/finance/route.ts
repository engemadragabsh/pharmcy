import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit, round2 } from "@/lib/server/core";

/** الخزينة: الورديات + المصروفات + كشوف الحساب */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "ACCOUNTANT", "CASHIER"]);
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") || "shifts";

    // ── الورديات ──
    if (view === "shifts") {
      const status = searchParams.get("status") || undefined;
      const items = await db.shift.findMany({
        where: status ? { status: status as any } : {},
        include: { user: { select: { fullName: true } }, branch: { select: { name: true } } },
        orderBy: { openedAt: "desc" },
        take: 30,
      });
      const open = items.find((s) => s.status === "OPEN");
      return NextResponse.json({ items, open });
    }

    // ── المصروفات والإيرادات ──
    if (view === "expenses") {
      const dateFrom = searchParams.get("dateFrom");
      const dateTo = searchParams.get("dateTo");
      const where: any = {};
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) { const t = new Date(dateTo); t.setHours(23, 59, 59, 999); where.createdAt.lte = t; }
      }
      const items = await db.expense.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      const totalExpense = round2(items.filter((e) => e.type === "EXPENSE").reduce((s, e) => s + e.amount, 0));
      const totalIncome = round2(items.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amount, 0));
      return NextResponse.json({ items, totalExpense, totalIncome });
    }

    // ── كشف حساب عميل/مورد ──
    if (view === "statement") {
      const type = searchParams.get("type"); // customer | supplier
      const id = searchParams.get("id");
      if (!type || !id) throw new ApiError(400, "حدد نوع الحساب (عميل/مورد)");

      if (type === "customer") {
        const customer = await db.customer.findUnique({ where: { id } });
        if (!customer) throw new ApiError(404, "العميل غير موجود");
        const invoices = await db.invoice.findMany({
          where: { customerId: id, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] } },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { id: true, no: true, type: true, total: true, paymentMethod: true, status: true, createdAt: true },
        });
        return NextResponse.json({
          party: { name: customer.name, code: customer.code, balance: customer.creditBalance },
          entries: invoices.map((i) => ({ date: i.createdAt, ref: i.no, description: i.type === "RETURN" ? "مرتجع" : "فاتورة بيع", debit: i.type === "RETURN" ? 0 : i.total, credit: i.type === "RETURN" ? i.total : 0, balance: 0 })),
        });
      }

      const supplier = await db.supplier.findUnique({ where: { id } });
      if (!supplier) throw new ApiError(404, "المورد غير موجود");
      const receipts = await db.goodsReceipt.findMany({
        where: { supplierId: id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { no: true, total: true, createdAt: true, notes: true },
      });
      return NextResponse.json({
        party: { name: supplier.name, code: supplier.code, balance: supplier.balance },
        entries: receipts.map((r) => ({ date: r.createdAt, ref: r.no, description: "استلام بضاعة", debit: r.total, credit: 0, balance: 0 })),
      });
    }

    throw new ApiError(400, "عرض غير معروف");
  } catch (e) {
    return handleApiError(e);
  }
}

/** فتح/إغلاق وردية + تسجيل مصروف */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "ACCOUNTANT", "CASHIER"]);
    const body = await req.json();
    const { action } = body ?? {};

    // ── فتح وردية ──
    if (action === "openShift") {
      const existing = await db.shift.findFirst({ where: { userId: user.id, status: "OPEN" } });
      if (existing) throw new ApiError(400, "لديك وردية مفتوحة بالفعل");
      const shift = await db.shift.create({
        data: {
          userId: user.id,
          branchId: body.branchId || user.branchId || "",
          openingBalance: Number(body.openingBalance || 0),
        },
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "SHIFT_OPEN", entity: "Shift", entityId: shift.id, details: `فتح وردية بعهدة ${shift.openingBalance} جنيه` });
      return NextResponse.json(shift, { status: 201 });
    }

    // ── إغلاق وردية ──
    if (action === "closeShift") {
      const { shiftId, closingBalance, notes } = body;
      if (!shiftId || closingBalance == null) throw new ApiError(400, "حدد الوردية والرصيد النهائي");
      const shift = await db.shift.findUnique({ where: { id: shiftId } });
      if (!shift || shift.status !== "OPEN") throw new ApiError(404, "الوردية غير مفتوحة");

      const saleWhere: any = { userId: user.id, paymentMethod: "CASH", createdAt: { gte: shift.openedAt } };
      const cashAgg = await db.invoice.aggregate({ _sum: { total: true }, where: saleWhere });
      const expenses = await db.expense.aggregate({ _sum: { amount: true }, where: { userId: user.id, type: "EXPENSE", createdAt: { gte: shift.openedAt } } });
      const expected = round2(shift.openingBalance + (cashAgg._sum?.total || 0) - (expenses._sum?.amount || 0));

      const closed = await db.shift.update({
        where: { id: shiftId },
        data: {
          closingBalance: Number(closingBalance),
          expectedBalance: expected,
          variance: round2(Number(closingBalance) - expected),
          status: "CLOSED",
          notes: notes || null,
          closedAt: new Date(),
        },
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "SHIFT_CLOSE", entity: "Shift", entityId: shiftId, details: `إغلاق وردية — متوقع ${expected} فعلي ${closingBalance} — فرق ${closed.variance}` });
      return NextResponse.json(closed);
    }

    // ── مصروف / إيراد ──
    if (action === "addExpense") {
      const { type, category, amount, note, branchId } = body;
      if (!category?.trim() || !amount || amount <= 0) throw new ApiError(400, "الفئة والمبلغ مطلوبان (المبلغ أكبر من صفر)");
      const expense = await db.expense.create({
        data: {
          type: type === "INCOME" ? "INCOME" : "EXPENSE",
          category: String(category).trim(),
          amount: Number(amount),
          note: note || null,
          userId: user.id,
          branchId: branchId || user.branchId || "",
        },
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "EXPENSE_CREATE", entity: "Expense", entityId: expense.id, details: `${type === "INCOME" ? "إيراد" : "مصروف"} ${category} — ${amount} جنيه` });
      return NextResponse.json(expense, { status: 201 });
    }

    throw new ApiError(400, "عملية غير معروفة");
  } catch (e) {
    return handleApiError(e);
  }
}

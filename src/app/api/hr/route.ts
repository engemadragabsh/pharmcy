import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** الموارد البشرية (مبسط): الموظفون + الحضور + الرواتب */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN", "ACCOUNTANT"]);
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") || "employees";

    if (view === "employees") {
      const items = await db.employee.findMany({
        include: { _count: { select: { attendances: true, payrolls: true } } },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ items });
    }

    if (view === "attendance") {
      const date = searchParams.get("date");
      const targetDate = date ? new Date(date) : new Date();
      targetDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const items = await db.attendance.findMany({
        where: { date: { gte: targetDate, lt: nextDay } },
        include: { employee: { select: { name: true, position: true } } },
        orderBy: { date: "asc" },
      });
      return NextResponse.json({ items, date: targetDate.toISOString().slice(0, 10) });
    }

    if (view === "payroll") {
      const month = searchParams.get("month") || new Date().toISOString().slice(0, 7);
      const items = await db.payroll.findMany({ where: { month }, include: { employee: { select: { name: true, position: true } } } });
      const employees = await db.employee.findMany({ where: { isActive: true } });
      const paidIds = new Set(items.map((p) => p.employeeId));
      return NextResponse.json({ items, month, pending: employees.filter((e) => !paidIds.has(e.id)).map((e) => ({ id: e.id, name: e.name, position: e.position, salary: e.salary })) });
    }

    throw new ApiError(400, "عرض غير معروف");
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "ACCOUNTANT"]);
    const body = await req.json();
    const { action } = body ?? {};

    // ── إضافة/تعديل موظف ──
    if (action === "saveEmployee") {
      if (body.id) {
        const employee = await db.employee.update({
          where: { id: body.id },
          data: {
            name: body.name != null ? String(body.name).trim() : undefined,
            position: body.position !== undefined ? body.position : undefined,
            phone: body.phone !== undefined ? body.phone : undefined,
            salary: body.salary != null ? Number(body.salary) : undefined,
            isActive: body.isActive !== undefined ? !!body.isActive : undefined,
          },
        });
        return NextResponse.json(employee);
      }
      if (!body.name?.trim()) throw new ApiError(400, "اسم الموظف مطلوب");
      const employee = await db.employee.create({
        data: {
          name: String(body.name).trim(),
          position: body.position || null,
          phone: body.phone || null,
          salary: Number(body.salary || 0),
          hireDate: body.hireDate ? new Date(body.hireDate) : new Date(),
        },
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "EMPLOYEE_CREATE", entity: "Employee", entityId: employee.id, details: `إضافة موظف: ${employee.name}` });
      return NextResponse.json(employee, { status: 201 });
    }

    // ── حضور/انصراف ──
    if (action === "checkIn" || action === "checkOut") {
      const { employeeId } = body;
      if (!employeeId) throw new ApiError(400, "حدد الموظف");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const nextDay = new Date(today);
      nextDay.setDate(nextDay.getDate() + 1);
      let record = await db.attendance.findFirst({ where: { employeeId, date: { gte: today, lt: nextDay } } });

      if (action === "checkIn") {
        if (record?.checkIn) throw new ApiError(400, "تم تسجيل الحضور مسبقاً اليوم");
        const hour = new Date().getHours();
        if (record) {
          record = await db.attendance.update({ where: { id: record.id }, data: { checkIn: new Date(), status: hour >= 9 ? "LATE" : "PRESENT" } });
        } else {
          record = await db.attendance.create({ data: { employeeId, date: new Date(), checkIn: new Date(), status: hour >= 9 ? "LATE" : "PRESENT" } });
        }
        return NextResponse.json(record);
      }
      if (!record?.checkIn) throw new ApiError(400, "لم يتم تسجيل حضور اليوم بعد");
      if (record.checkOut) throw new ApiError(400, "تم تسجيل الانصراف مسبقاً");
      record = await db.attendance.update({ where: { id: record.id }, data: { checkOut: new Date() } });
      return NextResponse.json(record);
    }

    // ── صرف راتب ──
    if (action === "payPayroll") {
      const { employeeId, month, deductions, bonuses } = body;
      if (!employeeId || !month) throw new ApiError(400, "حدد الموظف والشهر");
      const employee = await db.employee.findUnique({ where: { id: employeeId } });
      if (!employee) throw new ApiError(404, "الموظف غير موجود");
      const exists = await db.payroll.findFirst({ where: { employeeId, month } });
      if (exists) throw new ApiError(400, "تم صرف راتب هذا الموظف لهذا الشهر مسبقاً");
      const payroll = await db.payroll.create({
        data: {
          employeeId, month,
          baseSalary: employee.salary,
          deductions: Number(deductions || 0),
          bonuses: Number(bonuses || 0),
          netPaid: employee.salary + Number(bonuses || 0) - Number(deductions || 0),
        },
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "PAYROLL_PAY", entity: "Payroll", entityId: payroll.id, details: `صرف راتب ${employee.name} — ${payroll.netPaid} جنيه لشهر ${month}` });
      return NextResponse.json(payroll, { status: 201 });
    }

    throw new ApiError(400, "عملية غير معروفة");
  } catch (e) {
    return handleApiError(e);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** ملف عميل كامل — بيانات + فواتير + وصفات */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const customer = await db.customer.findUnique({ where: { id } });
    if (!customer) throw new ApiError(404, "العميل غير موجود");

    const [invoices, prescriptions] = await Promise.all([
      db.invoice.findMany({
        where: { customerId: id, type: "SALE" },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, no: true, total: true, status: true, paymentMethod: true, createdAt: true },
      }),
      db.prescription.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { doctor: { select: { name: true } }, items: true },
      }),
    ]);
    return NextResponse.json({ ...customer, invoices, prescriptions });
  } catch (e) {
    return handleApiError(e);
  }
}

/** تعديل عميل */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "CASHIER", "ACCOUNTANT"]);
    const { id } = await params;
    const body = await req.json();
    const customer = await db.customer.update({
      where: { id },
      data: {
        name: body.name != null ? String(body.name).trim() : undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
        email: body.email !== undefined ? body.email : undefined,
        address: body.address !== undefined ? body.address : undefined,
        gender: body.gender !== undefined ? body.gender : undefined,
        birthDate: body.birthDate !== undefined ? (body.birthDate ? new Date(body.birthDate) : null) : undefined,
        type: body.type !== undefined ? body.type : undefined,
        insuranceProvider: body.insuranceProvider !== undefined ? body.insuranceProvider : undefined,
        insuranceNumber: body.insuranceNumber !== undefined ? body.insuranceNumber : undefined,
        allergies: body.allergies !== undefined ? body.allergies : undefined,
        chronicDiseases: body.chronicDiseases !== undefined ? body.chronicDiseases : undefined,
        medicalHistory: body.medicalHistory !== undefined ? body.medicalHistory : undefined,
        notes: body.notes !== undefined ? body.notes : undefined,
        isActive: body.isActive !== undefined ? !!body.isActive : undefined,
      },
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "CUSTOMER_UPDATE", entity: "Customer", entityId: id, details: `تعديل عميل: ${customer.name}` });
    return NextResponse.json(customer);
  } catch (e) {
    return handleApiError(e);
  }
}

/** حذف عميل (إن لم يكن مرتبطاً بفواتير) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req, ["ADMIN", "ACCOUNTANT"]);
    const { id } = await params;
    const customer = await db.customer.findUnique({ where: { id }, include: { invoices: { take: 1 } } });
    if (!customer) throw new ApiError(404, "العميل غير موجود");
    if (customer.invoices.length > 0) {
      await db.customer.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ message: "تم تعطيل العميل (مرتبط بفواتير سابقة)" });
    }
    await db.customer.delete({ where: { id } });
    await logAudit({ userId: user.id, userName: user.fullName, action: "CUSTOMER_DELETE", entity: "Customer", entityId: id, details: `حذف عميل: ${customer.name}` });
    return NextResponse.json({ message: "تم حذف العميل" });
  } catch (e) {
    return handleApiError(e);
  }
}

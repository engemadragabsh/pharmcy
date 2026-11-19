import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** قائمة العملاء مع بحث */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const type = searchParams.get("type") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    const where: any = {};
    if (q) where.OR = [{ name: { contains: q } }, { phone: { contains: q } }, { code: { contains: q } }];
    if (type) where.type = type;

    const [items, total] = await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { invoices: true, prescriptions: true } } },
      }),
      db.customer.count({ where }),
    ]);
    return NextResponse.json({ items, total, page, pageSize: limit });
  } catch (e) {
    return handleApiError(e);
  }
}

/** إضافة عميل */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "CASHIER", "ACCOUNTANT"]);
    const body = await req.json();
    if (!body.name?.trim()) throw new ApiError(400, "اسم العميل مطلوب");
    if (body.phone && !/^0\d{9,10}$/.test(String(body.phone).replace(/\s/g, ""))) {
      throw new ApiError(400, "رقم الهاتف غير صحيح (مثال: 01012345678)");
    }
    const count = await db.customer.count();
    const customer = await db.customer.create({
      data: {
        code: `CUS-${String(count + 1).padStart(4, "0")}`,
        name: String(body.name).trim(),
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        gender: body.gender || null,
        birthDate: body.birthDate ? new Date(body.birthDate) : null,
        type: body.type || "NORMAL",
        insuranceProvider: body.insuranceProvider || null,
        insuranceNumber: body.insuranceNumber || null,
        allergies: body.allergies || null,
        chronicDiseases: body.chronicDiseases || null,
        medicalHistory: body.medicalHistory || null,
        notes: body.notes || null,
      },
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "CUSTOMER_CREATE", entity: "Customer", entityId: customer.id, details: `إضافة عميل: ${customer.name}` });
    return NextResponse.json(customer, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

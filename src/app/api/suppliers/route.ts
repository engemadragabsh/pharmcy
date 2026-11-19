import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** قائمة الموردين */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN", "ACCOUNTANT", "INVENTORY_MANAGER", "PHARMACIST"]);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const where: any = q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }, { phone: { contains: q } }] } : {};
    const items = await db.supplier.findMany({ where, orderBy: { name: "asc" } });
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

/** إضافة مورد */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "ACCOUNTANT", "INVENTORY_MANAGER"]);
    const body = await req.json();
    if (!body.name?.trim()) throw new ApiError(400, "اسم المورد مطلوب");
    const count = await db.supplier.count();
    const supplier = await db.supplier.create({
      data: {
        code: `SUP-${String(count + 1).padStart(4, "0")}`,
        name: String(body.name).trim(),
        contactPerson: body.contactPerson || null,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        paymentTerms: body.paymentTerms || null,
      },
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "SUPPLIER_CREATE", entity: "Supplier", entityId: supplier.id, details: `إضافة مورد: ${supplier.name}` });
    return NextResponse.json(supplier, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

/** تعديل مورد */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "ACCOUNTANT", "INVENTORY_MANAGER"]);
    const body = await req.json();
    if (!body.id) throw new ApiError(400, "معرّف المورد مطلوب");
    const supplier = await db.supplier.update({
      where: { id: body.id },
      data: {
        name: body.name != null ? String(body.name).trim() : undefined,
        contactPerson: body.contactPerson !== undefined ? body.contactPerson : undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
        email: body.email !== undefined ? body.email : undefined,
        address: body.address !== undefined ? body.address : undefined,
        paymentTerms: body.paymentTerms !== undefined ? body.paymentTerms : undefined,
        isActive: body.isActive !== undefined ? !!body.isActive : undefined,
      },
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "SUPPLIER_UPDATE", entity: "Supplier", entityId: supplier.id, details: `تعديل مورد: ${supplier.name}` });
    return NextResponse.json(supplier);
  } catch (e) {
    return handleApiError(e);
  }
}

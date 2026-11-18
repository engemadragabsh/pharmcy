import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";

/** قائمة الأطباء */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const where: any = q ? { OR: [{ name: { contains: q } }, { specialty: { contains: q } }] } : {};
    const items = await db.doctor.findMany({ where, orderBy: { name: "asc" } });
    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

/** إضافة طبيب */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST"]);
    const body = await req.json();
    if (!body.name?.trim()) throw new ApiError(400, "اسم الطبيب مطلوب");
    const doctor = await db.doctor.create({
      data: { name: String(body.name).trim(), specialty: body.specialty || null, clinic: body.clinic || null, phone: body.phone || null },
    });
    return NextResponse.json(doctor, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

/** تعديل طبيب */
export async function PUT(req: NextRequest) {
  try {
    await requireAuth(req, ["ADMIN", "PHARMACIST"]);
    const body = await req.json();
    if (!body.id) throw new ApiError(400, "معرّف الطبيب مطلوب");
    const doctor = await db.doctor.update({
      where: { id: body.id },
      data: {
        name: body.name != null ? String(body.name).trim() : undefined,
        specialty: body.specialty !== undefined ? body.specialty : undefined,
        clinic: body.clinic !== undefined ? body.clinic : undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
      },
    });
    return NextResponse.json(doctor);
  } catch (e) {
    return handleApiError(e);
  }
}

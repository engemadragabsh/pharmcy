import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

const ENTITIES: Record<string, string> = {
  manufacturers: "Manufacturer",
  ingredients: "ActiveIngredient",
  forms: "DosageForm",
  units: "UnitOfMeasure",
  services: "ServiceItem",
  coupons: "Coupon",
};

/** البيانات الأساسية — قراءة كل الكيانات مرة واحدة */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const [manufacturers, ingredients, forms, units, services, coupons] = await Promise.all([
      db.manufacturer.findMany({ orderBy: { name: "asc" } }),
      db.activeIngredient.findMany({ orderBy: { name: "asc" } }),
      db.dosageForm.findMany({ orderBy: { name: "asc" } }),
      db.unitOfMeasure.findMany({ orderBy: { name: "asc" } }),
      db.serviceItem.findMany({ orderBy: { name: "asc" } }),
      db.coupon.findMany({ orderBy: { code: "asc" } }),
    ]);
    return NextResponse.json({ manufacturers, ingredients, forms, units, services, coupons });
  } catch (e) {
    return handleApiError(e);
  }
}

/** إضافة / تعديل / حذف كيان أساسي: { entity, op: create|update|delete, data } */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER"]);
    const { entity, op, data } = (await req.json()) ?? {};
    const model = ENTITIES[entity];
    if (!model) throw new ApiError(400, "كيان غير معروف");
    const dbModel = (db as any)[Object.keys(ENTITIES).find((k) => ENTITIES[k] === model)!];

    if (op === "create") {
      if (!data?.name && entity !== "coupons") throw new ApiError(400, "الاسم مطلوب");
      if (entity === "coupons") {
        if (!data?.code?.trim()) throw new ApiError(400, "كود الكوبون مطلوب");
        const created = await db.coupon.create({ data: { code: String(data.code).toUpperCase(), type: data.type || "PERCENT", value: Number(data.value || 0), expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } });
        await logAudit({ userId: user.id, userName: user.fullName, action: "MD_CREATE", entity: "Coupon", entityId: created.id, details: `كوبون جديد: ${created.code}` });
        return NextResponse.json(created, { status: 201 });
      }
      if (entity === "services") {
        const created = await db.serviceItem.create({ data: { name: String(data.name).trim(), nameEn: data.nameEn || null, price: Number(data.price || 0) } });
        return NextResponse.json(created, { status: 201 });
      }
      const created = await dbModel.create({ data: { name: String(data.name).trim(), nameEn: data.nameEn || null, ...(entity === "manufacturers" ? { country: data.country || null } : {}) } });
      return NextResponse.json(created, { status: 201 });
    }

    if (op === "update") {
      if (!data?.id) throw new ApiError(400, "المعرّف مطلوب");
      const updated = await dbModel.update({
        where: { id: data.id },
        data: {
          name: data.name != null ? String(data.name).trim() : undefined,
          nameEn: data.nameEn !== undefined ? data.nameEn : undefined,
          ...(entity === "manufacturers" && data.country !== undefined ? { country: data.country } : {}),
          ...(entity === "services" && data.price !== undefined ? { price: Number(data.price) } : {}),
          ...(entity === "coupons" && data.value !== undefined ? { value: Number(data.value) } : {}),
          ...(entity === "coupons" && data.isActive !== undefined ? { isActive: !!data.isActive } : {}),
        },
      });
      return NextResponse.json(updated);
    }

    if (op === "delete") {
      if (!data?.id) throw new ApiError(400, "المعرّف مطلوب");
      await dbModel.delete({ where: { id: data.id } });
      return NextResponse.json({ message: "تم الحذف" });
    }

    throw new ApiError(400, "عملية غير معروفة");
  } catch (e: any) {
    if (e?.code === "P2003") return handleApiError(new ApiError(400, "لا يمكن الحذف — العنصر مستخدم في بيانات أخرى"));
    if (e?.code === "P2025") return handleApiError(new ApiError(404, "العنصر غير موجود"));
    return handleApiError(e);
  }
}

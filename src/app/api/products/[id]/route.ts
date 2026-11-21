import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";
import { normalizeName } from "@/lib/format";

/**
 * مزامنة وحدات البيع الإضافية (غير الأساسية) — Multi-UoM
 * تحدّث الصفوف الموجودة، تنشئ الجديد، تحذف المحذوف
 */
async function syncProductUnits(productId: string, units: any[]) {
  if (!Array.isArray(units)) return;
  const extras = units.filter((u: any) => !u.isBase);
  const keepIds = new Set(extras.filter((u: any) => u.id).map((u: any) => u.id));
  const existing = await db.productUnit.findMany({ where: { productId } });
  for (const row of existing) {
    if (!row.isBase && !keepIds.has(row.id)) {
      await db.productUnit.delete({ where: { id: row.id } });
    }
  }
  for (const u of extras) {
    const factor = Number(u.factor);
    if (!isFinite(factor) || factor <= 0 || factor === 1) throw new ApiError(400, `عامل تحويل غير صالح للوحدة «${u.unitName || ""}» — يجب أن يكون أكبر من صفر ومختلفاً عن 1`);
    const unitRec = u.unitId ? await db.unitOfMeasure.findUnique({ where: { id: u.unitId } }) : null;
    const data = {
      unitId: u.unitId || null,
      unitName: u.unitName || unitRec?.name || "وحدة",
      unitNameEn: u.unitNameEn || unitRec?.nameEn || null,
      factor,
      sellPrice: Number(u.sellPrice) || 0,
      wholesalePrice: u.wholesalePrice != null && u.wholesalePrice !== "" ? Number(u.wholesalePrice) : null,
      barcode: u.barcode?.trim() || null,
      isDefault: !!u.isDefault,
    };
    if (u.id) {
      await db.productUnit.update({ where: { id: u.id }, data });
    } else {
      await db.productUnit.create({ data: { productId, ...data } });
    }
  }
  // وحدة افتراضية واحدة فقط — إن لم توجد: الأساسية افتراضية
  const rows = await db.productUnit.findMany({ where: { productId } });
  const defaults = rows.filter((r) => r.isDefault);
  if (defaults.length === 0) {
    const base = rows.find((r) => r.isBase);
    if (base) await db.productUnit.update({ where: { id: base.id }, data: { isDefault: true } });
  } else if (defaults.length > 1) {
    for (const d of defaults.slice(1)) {
      await db.productUnit.update({ where: { id: d.id }, data: { isDefault: false } });
    }
  }
}

/** تفاصيل دواء — تشغيلات + بدائل دوائية */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const product = await db.product.findUnique({
      where: { id },
      include: {
        activeIngredient: true,
        manufacturer: true,
        dosageForm: true,
        unit: true,
        units: { orderBy: [{ isBase: "desc" }, { factor: "desc" }] },
        batches: { include: { branch: { select: { name: true, nameEn: true } } }, orderBy: { expiryDate: "asc" } },
      },
    });
    if (!product) throw new ApiError(404, "الدواء غير موجود");

    const alternatives = product.activeIngredientId
      ? await db.product.findMany({
          where: { activeIngredientId: product.activeIngredientId, id: { not: id }, isActive: true },
          select: { id: true, tradeName: true, tradeNameEn: true, sellPrice: true, concentration: true, barcode: true },
          take: 6,
        })
      : [];

    const movements = await db.stockMovement.findMany({
      where: { productId: id },
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    });

    return NextResponse.json({ ...product, alternatives, movements });
  } catch (e) {
    return handleApiError(e);
  }
}

/** تعديل دواء */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER"]);
    const { id } = await params;
    const body = await req.json();
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "الدواء غير موجود");
    if (body.barcode && body.barcode !== existing.barcode) {
      const dup = await db.product.findUnique({ where: { barcode: String(body.barcode).trim() } });
      if (dup) throw new ApiError(400, `الباركود مستخدم بالفعل للصنف «${dup.tradeName}»`);
    }
    // منع تكرار اسم الصنف عند التعديل (بحث بالاسم مع توحيد الهمزات والمسافات — يستثني الصنف نفسه)
    if (body.tradeName != null) {
      const nameNorm = normalizeName(String(body.tradeName));
      if (nameNorm !== normalizeName(existing.tradeName)) {
        const others = await db.product.findMany({
          where: { id: { not: id } },
          select: { id: true, tradeName: true },
        });
        const dupName = others.find((p) => normalizeName(p.tradeName) === nameNorm);
        if (dupName) throw new ApiError(409, `يوجد صنف بنفس الاسم «${dupName.tradeName}» — لا يمكن تكرار اسم الصنف`);
      }
    }
    const product = await db.product.update({
      where: { id },
      data: {
        barcode: body.barcode != null ? String(body.barcode).trim() : undefined,
        tradeName: body.tradeName != null ? String(body.tradeName).trim() : undefined,
        tradeNameEn: body.tradeNameEn !== undefined ? body.tradeNameEn : undefined,
        scientificName: body.scientificName !== undefined ? body.scientificName : undefined,
        activeIngredientId: body.activeIngredientId !== undefined ? body.activeIngredientId || null : undefined,
        dosageFormId: body.dosageFormId !== undefined ? body.dosageFormId || null : undefined,
        concentration: body.concentration !== undefined ? body.concentration : undefined,
        packSize: body.packSize !== undefined ? body.packSize : undefined,
        unitId: body.unitId !== undefined ? body.unitId || null : undefined,
        manufacturerId: body.manufacturerId !== undefined ? body.manufacturerId || null : undefined,
        originCountry: body.originCountry !== undefined ? body.originCountry : undefined,
        category: body.category !== undefined ? body.category : undefined,
        purchasePrice: body.purchasePrice != null ? Number(body.purchasePrice) : undefined,
        sellPrice: body.sellPrice != null ? Number(body.sellPrice) : undefined,
        wholesalePrice: body.wholesalePrice != null ? Number(body.wholesalePrice) : undefined,
        taxRate: body.taxRate != null ? Number(body.taxRate) : undefined,
        minStock: body.minStock != null ? Number(body.minStock) : undefined,
        reorderPoint: body.reorderPoint != null ? Number(body.reorderPoint) : undefined,
        shelfLocation: body.shelfLocation !== undefined ? body.shelfLocation : undefined,
        requiresPrescription: body.requiresPrescription !== undefined ? !!body.requiresPrescription : undefined,
        isActive: body.isActive !== undefined ? !!body.isActive : undefined,
        notes: body.notes !== undefined ? body.notes : undefined,
      },
    });

    // ── Multi-UoM: تحديث الوحدة الأساسية إن تغيّرت + مزامنة الوحدات الإضافية ──
    if (body.unitId != null) {
      const baseRow = await db.productUnit.findFirst({ where: { productId: id, isBase: true } });
      if (baseRow) {
        if (baseRow.unitId !== body.unitId) {
          const rec = body.unitId ? await db.unitOfMeasure.findUnique({ where: { id: body.unitId } }) : null;
          await db.productUnit.update({
            where: { id: baseRow.id },
            data: { unitId: body.unitId || null, unitName: rec?.name || "وحدة", unitNameEn: rec?.nameEn || "Unit", factor: 1, sellPrice: product.sellPrice },
          });
        } else if (body.sellPrice != null) {
          await db.productUnit.update({ where: { id: baseRow.id }, data: { sellPrice: product.sellPrice } });
        }
      } else if (body.unitId) {
        const rec = await db.unitOfMeasure.findUnique({ where: { id: body.unitId } });
        await db.productUnit.create({
          data: {
            productId: id, unitId: body.unitId,
            unitName: rec?.name || "وحدة", unitNameEn: rec?.nameEn || "Unit",
            factor: 1, sellPrice: product.sellPrice, wholesalePrice: product.wholesalePrice,
            isBase: true, isDefault: true,
          },
        });
      }
    }
    await syncProductUnits(id, body.units);
    await logAudit({ userId: user.id, userName: user.fullName, action: "PRODUCT_UPDATE", entity: "Product", entityId: id, details: `تعديل دواء: ${product.tradeName}` });
    return NextResponse.json(product);
  } catch (e) {
    return handleApiError(e);
  }
}

/** تعطيل دواء (حذف منطقي للحفاظ على سجل الفواتير) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER"]);
    const { id } = await params;
    const product = await db.product.findUnique({ where: { id }, include: { invoiceItems: { take: 1 } } });
    if (!product) throw new ApiError(404, "الدواء غير موجود");
    if (product.invoiceItems.length > 0) {
      await db.product.update({ where: { id }, data: { isActive: false } });
      await logAudit({ userId: user.id, userName: user.fullName, action: "PRODUCT_DISABLE", entity: "Product", entityId: id, details: `تعطيل دواء مرتبط بفواتير: ${product.tradeName}` });
      return NextResponse.json({ message: "تم تعطيل الدواء (مرتبط بفواتير سابقة)" });
    }
    await db.product.delete({ where: { id } });
    await logAudit({ userId: user.id, userName: user.fullName, action: "PRODUCT_DELETE", entity: "Product", entityId: id, details: `حذف دواء: ${product.tradeName}` });
    return NextResponse.json({ message: "تم حذف الدواء نهائياً" });
  } catch (e) {
    return handleApiError(e);
  }
}

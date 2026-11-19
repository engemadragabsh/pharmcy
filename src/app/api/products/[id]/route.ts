import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

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
      if (dup) throw new ApiError(400, "الباركود مستخدم بالفعل لمنتج آخر");
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

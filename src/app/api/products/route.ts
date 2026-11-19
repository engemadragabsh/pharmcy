import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** قائمة الأدوية — بحث + تصفية + ترقيم صفحات */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category") || undefined;
    const active = searchParams.get("active");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

    const where: any = {};
    if (q) {
      where.OR = [
        { tradeName: { contains: q } },
        { tradeNameEn: { contains: q } },
        { scientificName: { contains: q } },
        { barcode: { contains: q } },
      ];
    }
    if (category) where.category = category;
    if (active === "true") where.isActive = true;
    if (active === "false") where.isActive = false;

    const [items, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          activeIngredient: true,
          manufacturer: true,
          dosageForm: true,
          batches: { where: { quantity: { gt: 0 } }, select: { quantity: true, branchId: true, expiryDate: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ]);

    return NextResponse.json({
      items: items.map((p) => {
        const stock = p.batches.reduce((s, b) => s + b.quantity, 0);
        return {
          ...p,
          stock,
          margin: p.sellPrice > 0 ? Math.round(((p.sellPrice - p.purchasePrice) / p.sellPrice) * 100) : 0,
          batches: undefined,
        };
      }),
      total,
      page,
      pageSize: limit,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/** إضافة دواء جديد */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER"]);
    const body = await req.json();
    const { barcode, tradeName, sellPrice, purchasePrice, category } = body ?? {};
    if (!barcode || !tradeName) throw new ApiError(400, "الباركود والاسم التجاري مطلوبان");
    if (sellPrice == null || purchasePrice == null) throw new ApiError(400, "سعر الشراء والبيع مطلوبان");
    if (Number(sellPrice) < Number(purchasePrice)) throw new ApiError(400, "سعر البيع لا يمكن أن يكون أقل من سعر الشراء");

    const exists = await db.product.findUnique({ where: { barcode: String(barcode).trim() } });
    if (exists) throw new ApiError(400, "الباركود مستخدم بالفعل لمنتج آخر");

    const product = await db.product.create({
      data: {
        barcode: String(barcode).trim(),
        tradeName: String(tradeName).trim(),
        tradeNameEn: body.tradeNameEn || null,
        scientificName: body.scientificName || null,
        activeIngredientId: body.activeIngredientId || null,
        dosageFormId: body.dosageFormId || null,
        concentration: body.concentration || null,
        packSize: body.packSize || null,
        unitId: body.unitId || null,
        manufacturerId: body.manufacturerId || null,
        originCountry: body.originCountry || null,
        category: category || "OTC",
        purchasePrice: Number(purchasePrice),
        sellPrice: Number(sellPrice),
        wholesalePrice: Number(body.wholesalePrice || 0),
        taxRate: Number(body.taxRate ?? 14),
        minStock: Number(body.minStock || 5),
        reorderPoint: Number(body.reorderPoint || 10),
        shelfLocation: body.shelfLocation || null,
        requiresPrescription: !!body.requiresPrescription,
        notes: body.notes || null,
      },
    });
    await logAudit({ userId: user.id, userName: user.fullName, action: "PRODUCT_CREATE", entity: "Product", entityId: product.id, details: `إضافة دواء: ${product.tradeName}` });
    return NextResponse.json(product, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

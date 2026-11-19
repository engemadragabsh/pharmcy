import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError } from "@/lib/server/auth";

/** بحث سريع لنقطة البيع — باركود / اسم / مادة فعالة */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const branchId = searchParams.get("branchId") || undefined;
    if (!q) return NextResponse.json({ items: [] });

    // بحث بالباركود أولاً
    const byBarcode = await db.product.findUnique({
      where: { barcode: q },
      include: { activeIngredient: true },
    });

    const products = byBarcode
      ? [byBarcode]
      : await db.product.findMany({
          where: {
            isActive: true,
            OR: [
              { tradeName: { contains: q } },
              { tradeNameEn: { contains: q } },
              { scientificName: { contains: q } },
              { barcode: { contains: q } },
              { activeIngredient: { name: { contains: q } } },
              { activeIngredient: { nameEn: { contains: q } } },
            ],
          },
          include: { activeIngredient: true },
          take: 12,
          orderBy: { tradeName: "asc" },
        });

    // رصيد التشغيلات غير المنتهية لكل منتج
    const now = new Date();
    const ids = products.map((p) => p.id);
    const batches = await db.batch.findMany({
      where: { productId: { in: ids }, quantity: { gt: 0 }, expiryDate: { gt: now }, ...(branchId ? { branchId } : {}) },
      orderBy: { expiryDate: "asc" },
    });

    const items = products.map((p) => {
      const pb = batches.filter((b) => b.productId === p.id);
      return {
        id: p.id,
        barcode: p.barcode,
        tradeName: p.tradeName,
        tradeNameEn: p.tradeNameEn,
        scientificName: p.scientificName,
        concentration: p.concentration,
        packSize: p.packSize,
        sellPrice: p.sellPrice,
        taxRate: p.taxRate,
        category: p.category,
        requiresPrescription: p.requiresPrescription,
        activeIngredient: p.activeIngredient?.name || null,
        activeIngredientEn: p.activeIngredient?.nameEn || null,
        availableQty: pb.reduce((s, b) => s + b.quantity, 0),
        nearestExpiry: pb[0]?.expiryDate || null,
      };
    });

    return NextResponse.json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}

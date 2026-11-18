import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit, recordMovement } from "@/lib/server/core";

/** حركات المخزون + التشغيلات مع فلاتر (view=movements|batches) */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") || "movements";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const branchId = searchParams.get("branchId") || undefined;
    const productId = searchParams.get("productId") || undefined;
    const type = searchParams.get("type") || undefined;
    const filter = searchParams.get("filter"); // EXPIRING / EXPIRED / LOW

    if (view === "batches") {
      const now = new Date();
      const in90 = new Date(now.getTime() + 90 * 86400000);
      const where: any = { ...(branchId ? { branchId } : {}), ...(productId ? { productId } : {}) };
      if (filter === "EXPIRED") { where.expiryDate = { lt: now }; where.quantity = { gt: 0 }; }
      else if (filter === "EXPIRING") { where.expiryDate = { gte: now, lte: in90 }; where.quantity = { gt: 0 }; }

      const [items, total] = await Promise.all([
        db.batch.findMany({
          where,
          include: { product: { select: { tradeName: true, tradeNameEn: true, reorderPoint: true, minStock: true } }, branch: { select: { name: true, nameEn: true } } },
          orderBy: { expiryDate: "asc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.batch.count({ where }),
      ]);
      return NextResponse.json({ items, total, page, pageSize: limit });
    }

    // movements
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (productId) where.productId = productId;
    if (type) where.type = type;

    const [items, total] = await Promise.all([
      db.stockMovement.findMany({
        where,
        include: {
          product: { select: { tradeName: true, tradeNameEn: true } },
          branch: { select: { name: true, nameEn: true } },
          batch: { select: { batchNo: true } },
          user: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.stockMovement.count({ where }),
    ]);
    return NextResponse.json({ items, total, page, pageSize: limit });
  } catch (e) {
    return handleApiError(e);
  }
}

/** عمليات المخزون: استلام / تحويل / تسوية / جرد */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER"]);
    const body = await req.json();
    const { action } = body ?? {};

    // ── استلام مباشر (بدون أمر شراء) ──
    if (action === "receive") {
      const { productId, branchId, batchNo, expiryDate, qty, costPrice, shelfLocation } = body;
      if (!productId || !branchId || !batchNo || !expiryDate || !qty || qty <= 0) {
        throw new ApiError(400, "بيانات الاستلام غير مكتملة: المنتج والفرع والتشغيلة والصلاحية والكمية مطلوبة");
      }
      const product = await db.product.findUnique({ where: { id: productId } });
      if (!product) throw new ApiError(404, "المنتج غير موجود");

      const batch = await db.$transaction(async (tx) => {
        const b = await tx.batch.create({
          data: {
            productId, branchId, batchNo: String(batchNo).trim(),
            expiryDate: new Date(expiryDate),
            quantity: Number(qty),
            costPrice: Number(costPrice || product.purchasePrice),
            shelfLocation: shelfLocation || product.shelfLocation,
          },
        });
        await recordMovement(tx, {
          productId, batchId: b.id, branchId, type: "RECEIVE", quantity: Number(qty),
          refType: "DIRECT", note: "استلام مباشر للمخزون", userId: user.id,
        });
        return b;
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "STOCK_RECEIVE", entity: "Batch", entityId: batch.id, details: `استلام ${qty} من ${product.tradeName} — تشغيلة ${batchNo}` });
      return NextResponse.json(batch, { status: 201 });
    }

    // ── تحويل بين الفروع ──
    if (action === "transfer") {
      const { fromBranchId, toBranchId, items, note } = body;
      if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) throw new ApiError(400, "حدد الفرعين (المصدر والمستقبل) بشكل صحيح");
      if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, "أضف الأصناف المطلوب تحويلها");

      await db.$transaction(async (tx) => {
        for (const it of items) {
          if (!it.productId || !it.qty || it.qty <= 0) throw new ApiError(400, "صنف غير صالح في التحويل");
          const batches = await tx.batch.findMany({
            where: { productId: it.productId, branchId: fromBranchId, quantity: { gt: 0 }, expiryDate: { gt: new Date() } },
            orderBy: { expiryDate: "asc" },
          });
          let need = Number(it.qty);
          for (const b of batches) {
            if (need <= 0) break;
            const take = Math.min(b.quantity, need);
            need -= take;
            // خروج من المصدر
            await tx.batch.update({ where: { id: b.id }, data: { quantity: { decrement: take } } });
            // دخول للمستقبل — نفس التشغيلة أو جديدة
            const dest = await tx.batch.findFirst({ where: { productId: it.productId, branchId: toBranchId, batchNo: b.batchNo } });
            if (dest) {
              await tx.batch.update({ where: { id: dest.id }, data: { quantity: { increment: take } } });
            } else {
              await tx.batch.create({ data: { productId: it.productId, branchId: toBranchId, batchNo: b.batchNo, expiryDate: b.expiryDate, quantity: take, costPrice: b.costPrice, shelfLocation: b.shelfLocation } });
            }
            const product = await tx.product.findUnique({ where: { id: it.productId }, select: { tradeName: true } });
            await recordMovement(tx, { productId: it.productId, batchId: b.id, branchId: fromBranchId, type: "TRANSFER_OUT", quantity: -take, refType: "TRANSFER", note: note || "تحويل بين فروع", userId: user.id });
            await recordMovement(tx, { productId: it.productId, branchId: toBranchId, type: "TRANSFER_IN", quantity: take, refType: "TRANSFER", note: note || "تحويل بين فروع", userId: user.id });
          }
          if (need > 0) {
            const p = await tx.product.findUnique({ where: { id: it.productId }, select: { tradeName: true } });
            throw new ApiError(400, `المخزون غير كافٍ في الفرع المصدر: ${p?.tradeName}`);
          }
        }
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "STOCK_TRANSFER", entity: "Stock", details: `تحويل ${items.length} صنف بين الفروع` });
      return NextResponse.json({ message: "تم التحويل بنجاح" });
    }

    // ── تسوية جرد (تعديل كمية تشغيلة) ──
    if (action === "adjust") {
      const { batchId, newQty, note } = body;
      if (!batchId || newQty == null || newQty < 0) throw new ApiError(400, "حدد التشغيلة والكمية الجديدة");
      const batch = await db.batch.findUnique({ where: { id: batchId }, include: { product: true } });
      if (!batch) throw new ApiError(404, "التشغيلة غير موجودة");
      const variance = Number(newQty) - batch.quantity;
      await db.$transaction(async (tx) => {
        await tx.batch.update({ where: { id: batchId }, data: { quantity: Number(newQty) } });
        await recordMovement(tx, {
          productId: batch.productId, batchId, branchId: batch.branchId,
          type: "ADJUSTMENT", quantity: variance,
          refType: "ADJUSTMENT", note: note || "تسوية جرد يدوية", userId: user.id,
        });
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "STOCK_ADJUST", entity: "Batch", entityId: batchId, details: `تسوية ${batch.product.tradeName}: ${batch.quantity} → ${newQty} (${variance >= 0 ? "+" : ""}${variance})` });
      return NextResponse.json({ message: "تمت التسوية بنجاح", variance });
    }

    // ── جرد فعلي (دفعة أصناف) ──
    if (action === "stockCount") {
      const { branchId, items, note } = body;
      if (!branchId || !Array.isArray(items) || items.length === 0) throw new ApiError(400, "بيانات الجرد غير مكتملة");
      const count = await db.$transaction(async (tx) => {
        const c = await tx.stockCount.create({ data: { branchId, userId: user.id, status: "CLOSED", note, closedAt: new Date() } });
        let totalVariance = 0;
        for (const it of items) {
          const b = await tx.batch.findUnique({ where: { id: it.batchId } });
          if (!b) continue;
          const variance = Number(it.countedQty) - b.quantity;
          totalVariance += Math.abs(variance);
          await tx.stockCountItem.create({
            data: { countId: c.id, batchId: it.batchId, systemQty: b.quantity, countedQty: Number(it.countedQty), variance, note: it.note },
          });
          if (variance !== 0) {
            await tx.batch.update({ where: { id: it.batchId }, data: { quantity: Number(it.countedQty) } });
            await recordMovement(tx, {
              productId: b.productId, batchId: it.batchId, branchId, type: "STOCK_COUNT",
              quantity: variance, refType: "STOCK_COUNT", note: note || "جرد فعلي", userId: user.id,
            });
          }
        }
        return { c, totalVariance };
      });
      await logAudit({ userId: user.id, userName: user.fullName, action: "STOCK_COUNT", entity: "StockCount", entityId: count.c.id, details: `جرد فعلي — ${items.length} صنف — فروقات: ${count.totalVariance}` });
      return NextResponse.json({ message: "تم تنفيذ الجرد وتسوية الفروقات", countId: count.c.id, totalVariance: count.totalVariance });
    }

    throw new ApiError(400, "عملية غير معروفة");
  } catch (e) {
    return handleApiError(e);
  }
}

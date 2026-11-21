/**
 * الخدمات الأساسية للخادم: الترقيم التلقائي + المخزون FEFO + سجل العمليات + الإعدادات
 */
import { db } from "@/lib/db";
import { ApiError } from "./auth";

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ════════════════ الإعدادات ════════════════

export async function getSettings() {
  let s = await db.settings.findUnique({ where: { id: "main" } });
  if (!s) {
    s = await db.settings.create({
      data: {
        id: "main",
        pharmacyName: "صيدلية جديدة",
        pharmacyNameEn: "New Pharmacy",
      },
    });
  }
  return s;
}

// ════════════════ الترقيم التلقائي ════════════════

export type NumberKey = "invoice" | "po" | "grn" | "rx";

/** توليد الرقم التالي (مستدعاة داخل معاملة) */
export async function nextNumber(tx: any, key: NumberKey): Promise<string> {
  const s = await tx.settings.findUnique({ where: { id: "main" } });
  if (!s) throw new ApiError(500, "الإعدادات غير موجودة");
  let no: string;
  if (key === "invoice") {
    no = `${s.invoicePrefix}${String(s.nextInvoiceSeq).padStart(5, "0")}`;
    await tx.settings.update({ where: { id: "main" }, data: { nextInvoiceSeq: { increment: 1 } } });
  } else if (key === "po") {
    no = `PO-${String(s.nextPOSeq).padStart(4, "0")}`;
    await tx.settings.update({ where: { id: "main" }, data: { nextPOSeq: { increment: 1 } } });
  } else if (key === "grn") {
    no = `GRN-${String(s.nextGRNSeq).padStart(4, "0")}`;
    await tx.settings.update({ where: { id: "main" }, data: { nextGRNSeq: { increment: 1 } } });
  } else {
    no = `RX-${String(s.nextRxSeq).padStart(4, "0")}`;
    await tx.settings.update({ where: { id: "main" }, data: { nextRxSeq: { increment: 1 } } });
  }
  return no;
}

// ════════════════ سجل العمليات ════════════════

export async function logAudit(opts: {
  userId?: string | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: opts.userId ?? undefined,
        userName: opts.userName ?? undefined,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        details: opts.details,
      },
    });
  } catch (e) {
    console.error("[Audit]", e);
  }
}

// ════════════════ المخزون — FEFO ════════════════

export interface FefoAlloc {
  batchId: string;
  qty: number;
  costPrice: number;
  batchNo: string;
}

/** تخصيص الكمية من التشغيلات وفق FEFO (الأقرب انتهاءً أولاً) مع رفض المنتهي */
export async function allocateFefo(
  tx: any,
  productId: string,
  branchId: string,
  qty: number,
  productName?: string
): Promise<FefoAlloc[]> {
  if (qty <= 0) return [];
  const batches = await tx.batch.findMany({
    where: {
      productId,
      branchId,
      quantity: { gt: 0 },
      expiryDate: { gt: new Date() },
    },
    orderBy: { expiryDate: "asc" },
  });
  let need = qty;
  const allocs: FefoAlloc[] = [];
  for (const b of batches) {
    if (need <= 0) break;
    const take = Math.min(b.quantity, need);
    allocs.push({ batchId: b.id, qty: take, costPrice: b.costPrice, batchNo: b.batchNo });
    need -= take;
  }
  if (need > 0) {
    const available = batches.reduce((s, b) => s + b.quantity, 0);
    throw new ApiError(
      400,
      `المخزون غير كافٍ: ${productName || "المنتج"} — المتاح ${available} والمطلوب ${qty}`
    );
  }
  for (const a of allocs) {
    await tx.batch.update({ where: { id: a.batchId }, data: { quantity: { decrement: a.qty } } });
  }
  return allocs;
}

/** تسجيل حركة مخزون */
export async function recordMovement(
  tx: any,
  opts: {
    productId: string;
    batchId?: string | null;
    branchId: string;
    type: string;
    quantity: number;
    refType?: string;
    refId?: string;
    note?: string;
    userId?: string;
    createdAt?: Date;
  }
) {
  await tx.stockMovement.create({
    data: {
      productId: opts.productId,
      batchId: opts.batchId,
      branchId: opts.branchId,
      type: opts.type as any,
      quantity: opts.quantity,
      refType: opts.refType,
      refId: opts.refId,
      note: opts.note,
      userId: opts.userId,
      createdAt: opts.createdAt,
    },
  });
}

/** إشعار داخلي */
export async function createNotification(opts: {
  type: "LOW_STOCK" | "EXPIRY" | "PENDING_RX" | "SYSTEM" | "BACKUP";
  severity?: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  refType?: string;
  refId?: string;
}) {
  await db.notification.create({
    data: {
      type: opts.type,
      severity: opts.severity ?? "INFO",
      title: opts.title,
      message: opts.message,
      refType: opts.refType,
      refId: opts.refId,
    },
  });
}

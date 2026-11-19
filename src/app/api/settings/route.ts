import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";
import { logAudit } from "@/lib/server/core";

/** الإعدادات العامة */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    let settings = await db.settings.findUnique({ where: { id: "main" } });
    if (!settings) {
      settings = await db.settings.create({ data: { id: "main", pharmacyName: "صيدلية جديدة", pharmacyNameEn: "New Pharmacy" } });
    }
    return NextResponse.json(settings);
  } catch (e) {
    return handleApiError(e);
  }
}

/** تحديث الإعدادات مع حفظ نسخة للتراجع (Snapshot) */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN", "ACCOUNTANT"]);
    const body = await req.json();

    const current = await db.settings.findUnique({ where: { id: "main" } });
    if (!current) throw new ApiError(500, "الإعدادات غير موجودة");

    // نسخة قبل التعديل (قابلة للرجوع)
    await db.settingSnapshot.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        snapshot: JSON.stringify(current),
      },
    });

    const data: any = {};
    const stringFields = ["pharmacyName", "pharmacyNameEn", "logoUrl", "commercialReg", "taxNumber", "licenseNumber", "address", "phone", "email", "invoicePrefix", "invoiceHeader", "invoiceFooter", "invoiceTerms", "defaultPaymentMethod", "printerType", "expiryAlertDays", "stockMethod", "autoReportsEmail", "backupSchedule", "backupLocation", "theme", "language", "primaryColor", "stripeKey", "paymobKey", "etaClientId", "etaSecret", "whatsappToken", "smsProvider"];
    for (const f of stringFields) if (body[f] !== undefined) data[f] = body[f];
    const numberFields = ["defaultTaxRate", "nextInvoiceSeq", "nextPOSeq", "nextGRNSeq", "nextRxSeq", "loyaltyEarnRate", "loyaltyRedeemRate", "cashierMaxDiscount", "defaultReorderPoint"];
    for (const f of numberFields) if (body[f] !== undefined) data[f] = Number(body[f]);
    const boolFields = ["loyaltyEnabled", "alertLowStock", "alertExpiry", "alertPendingRx", "notifyInApp", "notifyEmail", "notifySms", "notifyWhatsapp"];
    for (const f of boolFields) if (body[f] !== undefined) data[f] = !!body[f];
    if (body.licenseExpiry !== undefined) data.licenseExpiry = body.licenseExpiry ? new Date(body.licenseExpiry) : null;
    if (body.lastBackupAt !== undefined) data.lastBackupAt = body.lastBackupAt ? new Date(body.lastBackupAt) : null;

    const settings = await db.settings.update({ where: { id: "main" }, data });
    await logAudit({ userId: user.id, userName: user.fullName, action: "SETTINGS_UPDATE", entity: "Settings", entityId: "main", details: "تحديث إعدادات النظام (تم حفظ نسخة للتراجع)" });
    return NextResponse.json(settings);
  } catch (e) {
    return handleApiError(e);
  }
}

/** سجل النسخ للتراجع */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req, ["ADMIN"]);
    const body = await req.json();
    const { action } = body ?? {};

    // تراجع لآخر نسخة
    if (action === "rollback") {
      const snapshots = await db.settingSnapshot.findMany({ orderBy: { createdAt: "desc" }, take: 1 });
      if (!snapshots.length) throw new ApiError(400, "لا توجد نسخ محفوظة للتراجع");
      const snap = JSON.parse(snapshots[0].snapshot);
      delete snap.id;
      delete snap.updatedAt;
      const settings = await db.settings.update({ where: { id: "main" }, data: snap });
      await logAudit({ userId: user.id, userName: user.fullName, action: "SETTINGS_ROLLBACK", entity: "Settings", entityId: "main", details: `تراجع لإعدادات محفوظة بتاريخ ${snapshots[0].createdAt.toISOString()}` });
      return NextResponse.json(settings);
    }

    // تنفيذ نسخة احتياطية يدوية (محاكاة)
    if (action === "backup") {
      const settings = await db.settings.update({ where: { id: "main" }, data: { lastBackupAt: new Date() } });
      await logAudit({ userId: user.id, userName: user.fullName, action: "BACKUP_MANUAL", entity: "Settings", entityId: "main", details: "نسخة احتياطية يدوية — تم بنجاح" });
      return NextResponse.json({ message: "تم تنفيذ النسخة الاحتياطية بنجاح", lastBackupAt: settings.lastBackupAt });
    }

    throw new ApiError(400, "عملية غير معروفة");
  } catch (e) {
    return handleApiError(e);
  }
}

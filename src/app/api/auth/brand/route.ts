import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/server/core";

/**
 * اسم الصيدلية العام (بدون مصادقة) — يُستخدم في شاشة تسجيل الدخول
 * لعرض الاسم المحفوظ في الإعدادات قبل وجود جلسة مستخدم.
 * يعيد حقول العلامة التجارية فقط — لا بيانات حساسة.
 */
export async function GET(_req: NextRequest) {
  try {
    const s = await getSettings();
    return NextResponse.json({
      pharmacyName: s.pharmacyName || "",
      pharmacyNameEn: s.pharmacyNameEn || "",
    });
  } catch {
    return NextResponse.json({ pharmacyName: "", pharmacyNameEn: "" });
  }
}

/**
 * أدوات التنسيق — عملة وتاريخ بأي لغة
 */
import { Lang } from "./i18n";

export function fmtMoney(n: number | null | undefined, lang: Lang = "AR"): string {
  const value = typeof n === "number" && isFinite(n) ? n : 0;
  const locale = lang === "AR" ? "ar-EG" : "en-EG";
  return value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (lang === "AR" ? " ج.م" : " EGP");
}

export function fmtNum(n: number | null | undefined, lang: Lang = "AR"): string {
  const value = typeof n === "number" && isFinite(n) ? n : 0;
  return value.toLocaleString(lang === "AR" ? "ar-EG" : "en-US");
}

export function fmtDate(d: string | Date | null | undefined, lang: Lang = "AR", withTime = false): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "-";
  const locale = lang === "AR" ? "ar-EG" : "en-GB";
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "numeric" };
  return date.toLocaleDateString(locale, opts);
}

export function daysUntil(d: string | Date | null | undefined): number {
  if (!d) return 0;
  const date = typeof d === "string" ? new Date(d) : d;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

/** حالة الصلاحية: expired / week / month / quarter / ok */
export function expiryStatus(d: string | Date | null | undefined): "expired" | "week" | "month" | "quarter" | "ok" {
  const days = daysUntil(d);
  if (days < 0) return "expired";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  if (days <= 90) return "quarter";
  return "ok";
}

export function todayISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function monthISO(offsetMonths = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

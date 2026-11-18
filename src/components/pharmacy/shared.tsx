"use client";

/**
 * مكونات مشتركة — ترويسة، بطاقات إحصائية، جداول، صفحات، نوافذ تأكيد
 */
import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { translate, Lang } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function useI18n() {
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  const t = (key: string) => translate(key, lang);
  const dir: "rtl" | "ltr" = lang === "AR" ? "rtl" : "ltr";
  return { t, lang, dir, setLang };
}

/** ضبط اتجاه الصفحة حسب اللغة */
export function useDirection() {
  const { lang } = useI18n();
  useEffect(() => {
    document.documentElement.lang = lang === "AR" ? "ar" : "en";
    document.documentElement.dir = lang === "AR" ? "rtl" : "ltr";
    document.title = lang === "AR" ? "صيدلية الشفاء — نظام إدارة الصيدليات" : "Al-Shifaa Pharmacy — PMS";
  }, [lang]);
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
        )}
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneCls = {
    default: "text-primary bg-primary/10",
    success: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400",
    warning: "text-amber-600 bg-amber-500/10 dark:text-amber-400",
    danger: "text-red-600 bg-red-500/10 dark:text-red-400",
  }[tone];
  return (
    <Card className="p-4 md:p-5 transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground truncate">{title}</p>
            <p className="text-xl md:text-2xl font-bold mt-1.5 text-foreground whitespace-nowrap">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", toneCls)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({ message, icon: Icon = Inbox }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const { lang } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const fmtN = (n: number) => n.toLocaleString(lang === "AR" ? "ar-EG" : "en-US");
  const prev = lang === "AR" ? ChevronRight : ChevronLeft;
  const next = lang === "AR" ? ChevronLeft : ChevronRight;
  const Prev = prev;
  const Next = next;
  return (
    <div className="flex items-center justify-between gap-2 mt-3">
      <p className="text-xs text-muted-foreground">
        {fmtN((page - 1) * pageSize + 1)}-{fmtN(Math.min(page * pageSize, total))} / {fmtN(total)}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="previous">
          <Prev className="h-4 w-4" />
        </Button>
        <span className="text-xs px-2">
          {fmtN(page)} / {fmtN(pages)}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="next">
          <Next className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  onConfirm,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  message?: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {message && <AlertDialogDescription>{message}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("app.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : ""}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t("app.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** ترجمة حالة الدفع */
export function paymentLabel(method: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    CASH: t("pos.pay.cash"),
    VISA: t("pos.pay.visa"),
    WALLET: t("pos.pay.wallet"),
    CREDIT: t("pos.pay.credit"),
    INSURANCE: t("pos.pay.insurance"),
  };
  return map[method] || method;
}

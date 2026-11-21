"use client";

/**
 * التقارير — 11 تقريراً مع تصدير CSV وطباعة
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, usePharmacyName, PageHeader, EmptyState, paymentLabel } from "./shared";
import { api, exportCsv } from "@/lib/client-api";
import { fmtMoney, fmtDate, fmtNum, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  BarChart3, FileDown, Printer, TrendingUp, Receipt, Percent, PackageX, CalendarClock,
  Users, UserRound, Building2, Files, History, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const REPORTS = [
  { key: "sales-daily", icon: History },
  { key: "sales-by-user", icon: UserRound },
  { key: "sales-by-branch", icon: Building2 },
  { key: "profit", icon: TrendingUp },
  { key: "inventory-low", icon: PackageX },
  { key: "inventory-expiring", icon: CalendarClock },
  { key: "slow-movers", icon: Activity },
  { key: "vat", icon: Percent },
  { key: "cashier-performance", icon: Receipt },
  { key: "top-products", icon: Files },
  { key: "top-customers", icon: Users },
];

const COLUMNS: Record<string, Record<string, string>> = {
  "sales-daily": { date: "التاريخ", count: "عدد الفواتير", tax: "الضريبة", total: "الإجمالي" },
  "sales-by-user": { name: "المستخدم", count: "الفواتير", total: "المبيعات" },
  "sales-by-branch": { name: "الفرع", count: "الفواتير", total: "المبيعات" },
  profit: { name: "المنتج", qty: "الكمية", revenue: "الإيراد", cost: "التكلفة", profit: "الربح", margin: "الهامش ٪" },
  "inventory-low": { name: "المنتج", qty: "الرصيد", reorderPoint: "حد الطلب", minStock: "الحد الأدنى", status: "الحالة" },
  "inventory-expiring": { name: "المنتج", batchNo: "التشغيلة", branch: "الفرع", expiry: "الصلاحية", days: "أيام", qty: "الكمية", value: "القيمة" },
  "slow-movers": { name: "المنتج", soldQty30d: "مبيعات 30ي", stockQty: "المخزون", stockValue: "القيمة", rotation: "الحركة" },
  vat: { month: "الشهر", count: "الفواتير", net: "الصافي", tax: "الضريبة", sales: "الإجمالي" },
  "cashier-performance": { name: "الكاشير", invoices: "الفواتير", items: "الأصناف", total: "المبيعات", avgInvoice: "متوسط الفاتورة", discounts: "الخصومات" },
  "top-products": { name: "المنتج", qty: "الكمية", revenue: "الإيراد" },
  "top-customers": { name: "العميل", code: "الكود", type: "النوع", count: "الفواتير", total: "المشتريات" },
};

export default function ReportsScreen() {
  const { t, lang } = useI18n();
  const pharmacyName = usePharmacyName();
  const { branchId, branches } = useApp();
  const [type, setType] = useState("sales-daily");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(todayISO());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fmtM = (n: number) => fmtMoney(n, lang);
  const fmtQ = (n: number) => fmtNum(n, lang);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, dateFrom, dateTo });
      if (branchId) params.set("branchId", branchId);
      const d = await api(`/reports?${params}`);
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setLoading(false);
     
  }, [type, dateFrom, dateTo, branchId]);

  useEffect(() => { run(); }, [run]);

  const cols = COLUMNS[type] || {};
  const rows = data?.rows || [];

  const exportData = () => {
    if (!rows.length) return;
    exportCsv(`${type}-${dateFrom}_${dateTo}.csv`, rows, cols);
    toast.success(t("app.export") + " ✓");
  };

  const fmtCell = (col: string, value: any) => {
    if (value == null) return "—";
    if (["total", "tax", "revenue", "cost", "profit", "value", "stockValue", "avgInvoice", "discounts", "sales", "net"].includes(col)) return fmtM(value);
    if (["qty", "count", "invoices", "items", "soldQty30d", "stockQty", "days"].includes(col)) return fmtQ(value);
    if (col === "margin") return `${value}٪`;
    if (col === "type" && data?.type === "top-customers") return t(`cust.type.${value}`);
    if (col === "rotation") return value === "راكد" ? t("rep.stagnant") : value === "بطيء" ? t("rep.slow") : t("rep.normal");
    if (col === "expiry") return fmtDate(value, lang);
    return String(value);
  };

  const moneyCols = ["total", "tax", "revenue", "cost", "profit", "value", "stockValue", "avgInvoice", "sales", "net", "discounts"];

  const summaryCards = () => {
    if (!data?.summary) return null;
    const s = data.summary;
    const entries: Array<[string, string, boolean?]> = [];
    if (s.totalSales != null) entries.push([t("rep.totalSales"), fmtM(s.totalSales)]);
    if (s.totalTax != null) entries.push([t("rep.totalTax"), fmtM(s.totalTax)]);
    if (s.totalProfit != null) entries.push([t("rep.profitCol"), fmtM(s.totalProfit)]);
    if (s.totalInvoices != null) entries.push([lang === "AR" ? "عدد الفواتير" : "Invoices", fmtQ(s.totalInvoices)]);
    if (s.avgPerDay != null) entries.push([lang === "AR" ? "متوسط يومي" : "Daily Avg", fmtM(s.avgPerDay)]);
    if (s.count != null) entries.push([lang === "AR" ? "عدد الصفوف" : "Count", fmtQ(s.count)]);
    if (s.outOfStock != null) entries.push([lang === "AR" ? "نفد المخزون" : "Out of Stock", fmtQ(s.outOfStock)]);
    if (s.valueAtRisk != null) entries.push([t("rep.value"), fmtM(s.valueAtRisk)]);
    if (s.stagnant != null) entries.push([t("rep.stagnant"), fmtQ(s.stagnant)]);
    if (s.expired != null) entries.push([t("dash.expired"), fmtQ(s.expired)]);
    if (entries.length === 0) return null;
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {entries.map(([label, value]) => (
          <div key={label} className="p-3 rounded-lg border bg-muted/40">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-base font-bold mt-0.5">{value}</p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title={t("rep.title")}
        actions={
          <>
            <Button variant="outline" onClick={exportData} disabled={!rows.length} className="gap-2">
              <FileDown className="h-4 w-4" /> {t("app.export")}
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" /> {t("app.print")}
            </Button>
          </>
        }
      />

      {/* شريط الاختيار */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.key}
              onClick={() => setType(r.key)}
              className={cn(
                "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-[11px] font-medium transition-all",
                type === r.key ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40 text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-center leading-tight">{t(`rep.${r.key}`)}</span>
            </button>
          );
        })}
      </div>

      <Card className="mb-4 print:hidden">
        <CardContent className="p-3 flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">{t("app.from")}</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">{t("app.to")}</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={run} disabled={loading} className="gap-2">
            {loading ? t("app.loading") : t("rep.run")}
          </Button>
        </CardContent>
      </Card>

      <Card className="print-area print-report">
        {/* ترويسة الطباعة — اسم الصيدلية مصدره بيانات شاشة الإعدادات المحفوظة */}
        <div className="hidden print:block text-center border-b border-gray-300 pb-2 pt-1">
          <h2 className="text-lg font-bold">{pharmacyName}</h2>
          <p className="text-xs mt-0.5">
            {t(`rep.${type}`)} — {fmtDate(dateFrom, lang)} ← {fmtDate(dateTo, lang)}
          </p>
        </div>
        <CardHeader className="print:hidden">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {t(`rep.${type}`)} — {fmtDate(dateFrom, lang)} ← {fmtDate(dateTo, lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {summaryCards()}
          {rows.length === 0 ? (
            <EmptyState message={loading ? t("app.loading") : t("app.noData")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(cols).map((c) => (
                      <TableHead key={c} className={moneyCols.includes(c) ? "text-end" : ""}>{cols[c]}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any, i: number) => (
                    <TableRow key={i}>
                      {Object.keys(cols).map((c) => (
                        <TableCell key={c} className={cn("text-sm", moneyCols.includes(c) && "text-end font-medium", c === "profit" && Number(row[c]) < 0 && "text-red-500", c === "status" && row[c] === "نفد" && "text-red-500 font-bold")}>
                          {fmtCell(c, row[c])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

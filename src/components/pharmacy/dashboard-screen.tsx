"use client";

/**
 * لوحة التحكم — مؤشرات الأداء، رسوم بيانية، تنبيهات فورية، أحدث الفواتير
 */
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, StatCard, EmptyState, paymentLabel } from "./shared";
import { api } from "@/lib/client-api";
import { fmtMoney, fmtDate, fmtNum } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import {
  LayoutDashboard, TrendingUp, Receipt, PackageX, CalendarClock,
  AlertTriangle, FileText, ShoppingCart, Wallet, Activity, Stethoscope,
} from "lucide-react";

interface DashData {
  kpis: {
    todaySales: number; monthSales: number; todayInvoices: number;
    lowStockCount: number; expiringCount: number; expiredCount: number;
    pendingRx: number; cashInDrawer: number;
  };
  charts: {
    sales14d: Array<{ date: string; total: number; count: number }>;
    sales12m: Array<{ month: string; total: number }>;
    topProducts: Array<{ name: string; qty: number; revenue: number }>;
    topCustomers: Array<{ name: string; code: string; total: number; count: number }>;
  };
  alerts: {
    lowStock: Array<{ id: string; tradeName: string; qty: number; reorderPoint: number }>;
    expired: Array<{ id: string; product: string; batchNo: string; expiry: string; qty: number }>;
    expiring: Array<{ id: string; product: string; batchNo: string; expiry: string; qty: number; days: number }>;
    pendingRx: Array<{ id: string; no: string; customer: string; doctor: string; createdAt: string }>;
  };
  recentInvoices: Array<{ id: string; no: string; total: number; status: string; paymentMethod: string; customer: string; cashier: string; createdAt: string }>;
  openShift: { id: string; user: string; openedAt: string; openingBalance: number } | null;
}

const PIE_COLORS = ["#059669", "#0d9488", "#34d399", "#2dd4bf", "#6ee7b7", "#99f6e4"];

export default function DashboardScreen({ onNavigate }: { onNavigate: (m: string) => void }) {
  const { t, lang } = useI18n();
  const { branchId } = useApp();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api(`/dashboard?branchId=${branchId || ""}`);
      setData(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
     
  }, [branchId]);

  const fmtM = (n: number) => fmtMoney(n, lang);
  const fmtQ = (n: number) => fmtNum(n, lang);

  const chartDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title={t("dash.title")}
        subtitle={`${fmtDate(new Date(), lang)} • ${data?.openShift ? `${t("dash.openShift")}: ${data.openShift.user}` : t("dash.noShift")}`}
        actions={
          <Button onClick={() => onNavigate("pos")} className="gap-2">
            <ShoppingCart className="h-4 w-4" /> {t("dash.newSale")}
          </Button>
        }
      />

      {loading || !data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title={t("dash.todaySales")} value={fmtM(data.kpis.todaySales)} icon={TrendingUp} tone="success" hint={`${fmtQ(data.kpis.todayInvoices)} ${t("dash.invoices")}`} />
            <StatCard title={t("dash.monthSales")} value={fmtM(data.kpis.monthSales)} icon={Receipt} />
            <StatCard title={t("dash.cashDrawer")} value={fmtM(data.kpis.cashInDrawer)} icon={Wallet} hint={data.openShift ? `${t("fin.status.OPEN")} • ${data.openShift.user}` : t("dash.noShift")} />
            <StatCard title={t("dash.pendingRx")} value={fmtQ(data.kpis.pendingRx)} icon={Stethoscope} tone={data.kpis.pendingRx > 0 ? "warning" : "default"} />
            <StatCard title={t("dash.lowStock")} value={fmtQ(data.kpis.lowStockCount)} icon={PackageX} tone={data.kpis.lowStockCount > 0 ? "warning" : "default"} />
            <StatCard title={t("dash.expiring")} value={fmtQ(data.kpis.expiringCount)} icon={CalendarClock} tone={data.kpis.expiringCount > 0 ? "warning" : "default"} />
            <StatCard title={t("dash.expired")} value={fmtQ(data.kpis.expiredCount)} icon={AlertTriangle} tone={data.kpis.expiredCount > 0 ? "danger" : "default"} />
            <StatCard title={t("dash.todayInvoices")} value={fmtQ(data.kpis.todayInvoices)} icon={FileText} />
          </div>

          {/* الرسوم */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-4">
            <Card className="xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("dash.sales14d")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.charts.sales14d.map((d) => ({ ...d, label: chartDate(d.date) }))}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#10b98122" />
                    <XAxis dataKey="label" fontSize={11} tickLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} width={55} />
                    <Tooltip formatter={(v) => fmtM(Number(v))} labelStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="total" stroke="#059669" strokeWidth={2.5} fill="url(#salesGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("dash.topCustomers")}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.charts.topCustomers.length === 0 ? (
                  <EmptyState message={t("app.noData")} />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={data.charts.topCustomers.map((c) => ({ name: c.name, value: Math.round(c.total) }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={75}
                        paddingAngle={3}
                      >
                        {data.charts.topCustomers.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtM(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("dash.topProducts")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={data.charts.topProducts.slice(0, 6)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#10b98122" />
                    <XAxis type="number" fontSize={11} tickLine={false} />
                    <YAxis type="category" dataKey="name" fontSize={10} width={110} tickLine={false} />
                    <Tooltip formatter={(v, name) => name === "revenue" ? fmtM(Number(v)) : fmtQ(Number(v))} />
                    <Bar dataKey="revenue" fill="#059669" radius={[0, 6, 6, 0]} barSize={16} name="revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("dash.sales12m")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={data.charts.sales12m}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#10b98122" />
                    <XAxis dataKey="month" fontSize={9} tickLine={false} angle={-40} textAnchor="end" height={45} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={50} />
                    <Tooltip formatter={(v) => fmtM(Number(v))} />
                    <Bar dataKey="total" fill="#0d9488" radius={[6, 6, 0, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* التنبيهات وأحدث الفواتير */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" /> {t("dash.alerts")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-72 px-4 pb-4">
                  <div className="space-y-2">
                    {data.alerts.expired.map((e) => (
                      <AlertRow key={`e-${e.id}`} severity="danger" text={`${e.product} — ${e.batchNo}`} sub={`${t("dash.expired")} • ${fmtQ(e.qty)} ${lang === "AR" ? "علبة" : "packs"}`} onClick={() => onNavigate("inventory")} />
                    ))}
                    {data.alerts.expiring.map((e) => (
                      <AlertRow key={`x-${e.id}`} severity="warning" text={`${e.product} — ${e.batchNo}`} sub={`${fmtQ(e.days)} ${t("prod.days")} • ${fmtQ(e.qty)} ${lang === "AR" ? "علبة" : "packs"}`} onClick={() => onNavigate("inventory")} />
                    ))}
                    {data.alerts.lowStock.slice(0, 4).map((p) => (
                      <AlertRow key={`l-${p.id}`} severity="warning" text={p.tradeName} sub={`${t("prod.stock")}: ${fmtQ(p.qty)} • ${t("prod.reorderPoint")}: ${fmtQ(p.reorderPoint)}`} onClick={() => onNavigate("products")} />
                    ))}
                    {data.alerts.pendingRx.map((r) => (
                      <AlertRow key={`r-${r.id}`} severity="info" text={`${r.no} — ${r.customer}`} sub={`${r.doctor} • ${fmtDate(r.createdAt, lang)}`} onClick={() => onNavigate("prescriptions")} />
                    ))}
                    {!data.alerts.expired.length && !data.alerts.expiring.length && !data.alerts.lowStock.length && !data.alerts.pendingRx.length && (
                      <EmptyState message={lang === "AR" ? "لا توجد تنبيهات — كل شيء تحت السيطرة" : "No alerts — all clear"} icon={Activity} />
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" /> {t("dash.recentInvoices")}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => onNavigate("reports")}>{t("app.viewAll")}</Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-72 px-4 pb-4">
                  <div className="space-y-2">
                    {data.recentInvoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border text-sm">
                        <div className="min-w-0">
                          <p className="font-mono font-semibold text-xs" dir="ltr">{inv.no}</p>
                          <p className="text-xs text-muted-foreground truncate">{inv.customer} • {inv.cashier}</p>
                        </div>
                        <div className="text-end shrink-0">
                          <p className="font-bold">{fmtM(inv.total)}</p>
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[10px] px-1.5">{paymentLabel(inv.paymentMethod, t)}</Badge>
                            {inv.status === "PARTIALLY_REFUNDED" && <Badge variant="destructive" className="text-[10px] px-1.5">{lang === "AR" ? "مرتجع جزئي" : "Partial Refund"}</Badge>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function AlertRow({ severity, text, sub, onClick }: { severity: "danger" | "warning" | "info"; text: string; sub: string; onClick?: () => void }) {
  const cls = {
    danger: "border-red-500/40 bg-red-50 dark:bg-red-950/30",
    warning: "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30",
    info: "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30",
  }[severity];
  return (
    <button onClick={onClick} className={`w-full text-start flex items-center gap-2 p-2.5 rounded-lg border ${cls} hover:shadow-sm transition-shadow`}>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{text}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
      </div>
    </button>
  );
}

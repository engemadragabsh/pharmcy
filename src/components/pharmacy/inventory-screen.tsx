"use client";

/**
 * المخزون والمستودعات — حركات، استلام، تحويل، تسوية، جرد، مراقبة صلاحية
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState, Pagination } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { fmtMoney, fmtDate, fmtNum, expiryStatus } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Warehouse, ArrowLeftRight, PackagePlus, Scale, ClipboardCheck,
  CalendarClock, Search, RefreshCw, Plus, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function InventoryScreen() {
  const { t, lang } = useI18n();
  const { branches } = useApp();
  const [tab, setTab] = useState("movements");

  const fmtM = (n: number) => fmtMoney(n, lang);
  const fmtQ = (n: number) => fmtNum(n, lang);

  // ─── الحركات ───
  const [movements, setMovements] = useState<any[]>([]);
  const [movTotal, setMovTotal] = useState(0);
  const [movPage, setMovPage] = useState(1);
  const [movType, setMovType] = useState("all");
  const [movBranch, setMovBranch] = useState("all");

  const loadMovements = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(movPage), limit: "15", view: "movements" });
      if (movType !== "all") params.set("type", movType);
      if (movBranch !== "all") params.set("branchId", movBranch);
      const data = await api(`/stock?${params}`);
      setMovements(data.items || []);
      setMovTotal(data.total || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
     
  }, [movPage, movType, movBranch]);

  // ─── التشغيلات والصلاحية ───
  const [batches, setBatches] = useState<any[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchPage, setBatchPage] = useState(1);
  const [batchFilter, setBatchFilter] = useState("all");
  const [batchBranch, setBatchBranch] = useState("all");

  const loadBatches = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(batchPage), limit: "15", view: "batches" });
      if (batchFilter !== "all") params.set("filter", batchFilter);
      if (batchBranch !== "all") params.set("branchId", batchBranch);
      const data = await api(`/stock?${params}`);
      setBatches(data.items || []);
      setBatchTotal(data.total || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
     
  }, [batchPage, batchFilter, batchBranch]);

  useEffect(() => { if (tab === "movements") loadMovements(); }, [tab, loadMovements]);
  useEffect(() => { if (tab === "expiry") loadBatches(); }, [tab, loadBatches]);
  useEffect(() => { if (tab === "count") loadBatches(); }, [tab, loadBatches]);

  // ─── الاستلام ───
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [rForm, setRForm] = useState({ productId: "", branchId: "", batchNo: "", expiryDate: "", qty: "", costPrice: "", shelfLocation: "" });

  // ─── التحويل ───
  const [transferItems, setTransferItems] = useState<Array<{ productId: string; name: string; qty: number; available: number }>>([]);
  const [trFrom, setTrFrom] = useState("");
  const [trTo, setTrTo] = useState("");
  const [trProduct, setTrProduct] = useState("");
  const [trQty, setTrQty] = useState("");
  const [trAvail, setTrAvail] = useState(0);

  // ─── التسوية ───
  const [adjustBatch, setAdjustBatch] = useState<any>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  // ─── الجرد ───
  const [countBranch, setCountBranch] = useState("");
  const [countItems, setCountItems] = useState<Array<{ batchId: string; name: string; batchNo: string; systemQty: number; countedQty: number }>>([]);
  const [countNote, setCountNote] = useState("");

  useEffect(() => {
    api("/products?limit=100").then((d) => setProducts(d.items || [])).catch(() => {});
  }, []);

  const receiveSubmit = async () => {
    try {
      await api("/stock", {
        method: "POST",
        body: {
          action: "receive",
          productId: rForm.productId,
          branchId: rForm.branchId,
          batchNo: rForm.batchNo,
          expiryDate: rForm.expiryDate,
          qty: Number(rForm.qty),
          costPrice: Number(rForm.costPrice),
          shelfLocation: rForm.shelfLocation,
        },
      });
      toast.success(t("inv.done") + " ✓");
      setReceiveOpen(false);
      setRForm({ productId: "", branchId: "", batchNo: "", expiryDate: "", qty: "", costPrice: "", shelfLocation: "" });
      loadBatches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const loadTransferAvail = async (productId: string) => {
    if (!productId || !trFrom) return;
    try {
      const data = await api(`/stock?view=batches&productId=${productId}&branchId=${trFrom}&limit=100`);
      const avail = (data.items || []).filter((b: any) => b.expiryDate > new Date().toISOString()).reduce((s: number, b: any) => s + b.quantity, 0);
      setTrAvail(avail);
    } catch {}
  };

  const addTransferItem = () => {
    const p = products.find((x) => x.id === trProduct);
    if (!p || !trQty || Number(trQty) <= 0 || !trFrom || !trTo || trFrom === trTo) {
      toast.error(lang === "AR" ? "حدد الفرعين والمنتج والكمية" : "Select branches, product and qty");
      return;
    }
    if (Number(trQty) > trAvail) {
      toast.error(`${t("pos.qtyExceeds")} (${fmtQ(trAvail)})`);
      return;
    }
    if (transferItems.some((x) => x.productId === trProduct)) {
      toast.error(lang === "AR" ? "الصنف مضاف بالفعل" : "Item already added");
      return;
    }
    setTransferItems([...transferItems, { productId: trProduct, name: p.tradeName, qty: Number(trQty), available: trAvail }]);
    setTrProduct("");
    setTrQty("");
    setTrAvail(0);
  };

  const submitTransfer = async () => {
    if (!transferItems.length) return;
    try {
      await api("/stock", { method: "POST", body: { action: "transfer", fromBranchId: trFrom, toBranchId: trTo, items: transferItems } });
      toast.success(t("inv.done") + " ✓");
      setTransferItems([]);
      loadMovements();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const submitAdjust = async () => {
    if (!adjustBatch || adjustQty === "") return;
    try {
      const res = await api("/stock", { method: "POST", body: { action: "adjust", batchId: adjustBatch.id, newQty: Number(adjustQty), note: adjustNote } });
      toast.success(`${t("inv.done")} (${t("inv.variance")}: ${res.variance > 0 ? "+" : ""}${fmtQ(res.variance)})`);
      setAdjustBatch(null);
      loadBatches();
      loadMovements();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const startCount = async () => {
    if (!countBranch) {
      toast.error(lang === "AR" ? "حدد الفرع" : "Select branch");
      return;
    }
    try {
      const data = await api(`/stock?view=batches&branchId=${countBranch}&limit=100`);
      const all = data.items || [];
      setCountItems(all.map((b: any) => ({ batchId: b.id, name: b.product.tradeName, batchNo: b.batchNo, systemQty: b.quantity, countedQty: b.quantity })));
      if (!all.length) toast.info(t("app.noData"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const submitCount = async () => {
    if (!countItems.length) return;
    const changed = countItems.filter((i) => i.countedQty !== i.systemQty);
    if (!changed.length) {
      toast.info(lang === "AR" ? "لا فروقات — تم تأكيد الجرد بدون تسويات" : "No variances");
      return;
    }
    try {
      const res = await api("/stock", {
        method: "POST",
        body: { action: "stockCount", branchId: countBranch, items: changed.map((i) => ({ batchId: i.batchId, countedQty: i.countedQty })), note: countNote },
      });
      toast.success(`${t("inv.done")} — ${lang === "AR" ? "فروقات" : "variances"}: ${fmtQ(res.totalVariance)}`);
      setCountItems([]);
      loadBatches();
      loadMovements();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const expBadge = (d: string) => {
    const st = expiryStatus(d);
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    return (
      <Badge
        variant={st === "expired" ? "destructive" : st === "week" ? "destructive" : st === "month" ? "secondary" : "outline"}
        className={cn(st === "week" && "bg-red-100 text-red-700 border-0", st === "month" && "bg-amber-100 text-amber-700 border-0")}
      >
        {st === "expired" ? t("prod.expiredBatch") : `${fmtQ(days)} ${t("prod.days")}`}
      </Badge>
    );
  };

  return (
    <div>
      <PageHeader
        icon={Warehouse}
        title={t("inv.title")}
        actions={
          <Button onClick={() => setReceiveOpen(true)} className="gap-2">
            <PackagePlus className="h-4 w-4" /> {t("inv.receive")}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab} dir={lang === "AR" ? "rtl" : "ltr"}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="movements" className="gap-1.5"><RefreshCw className="h-4 w-4" /> {t("inv.movements")}</TabsTrigger>
          <TabsTrigger value="expiry" className="gap-1.5"><CalendarClock className="h-4 w-4" /> {t("inv.expiry")}</TabsTrigger>
          <TabsTrigger value="transfer" className="gap-1.5"><ArrowLeftRight className="h-4 w-4" /> {t("inv.transfer")}</TabsTrigger>
          <TabsTrigger value="adjust" className="gap-1.5"><Scale className="h-4 w-4" /> {t("inv.adjust")}</TabsTrigger>
          <TabsTrigger value="count" className="gap-1.5"><ClipboardCheck className="h-4 w-4" /> {t("inv.count")}</TabsTrigger>
        </TabsList>

        {/* ─── الحركات ─── */}
        <TabsContent value="movements">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2 mb-3">
                <Select value={movType} onValueChange={(v) => { setMovType(v); setMovPage(1); }}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("app.all")}</SelectItem>
                    {["RECEIVE", "SALE", "SALE_REFUND", "TRANSFER_OUT", "TRANSFER_IN", "ADJUSTMENT", "STOCK_COUNT", "ISSUE"].map((m) => (
                      <SelectItem key={m} value={m}>{t(`inv.type.${m}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={movBranch} onValueChange={(v) => { setMovBranch(v); setMovPage(1); }}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("app.all")}</SelectItem>
                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "AR" ? b.name : b.nameEn}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {movements.length === 0 ? (
                <EmptyState message={t("app.noData")} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("app.date")}</TableHead>
                        <TableHead>{t("prod.tradeName")}</TableHead>
                        <TableHead>{t("app.type")}</TableHead>
                        <TableHead className="text-center">{t("app.quantity")}</TableHead>
                        <TableHead>{t("app.branch")}</TableHead>
                        <TableHead>{lang === "AR" ? "المستخدم" : "User"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.createdAt, lang, true)}</TableCell>
                          <TableCell className="text-sm font-medium">{m.product?.tradeName || "-"}</TableCell>
                          <TableCell><Badge variant="outline">{t(`inv.type.${m.type}`)}</Badge></TableCell>
                          <TableCell className={cn("text-center font-bold", m.quantity < 0 ? "text-red-500" : "text-emerald-600")}>{m.quantity > 0 ? `+${fmtQ(m.quantity)}` : fmtQ(m.quantity)}</TableCell>
                          <TableCell className="text-xs">{lang === "AR" ? m.branch?.name : m.branch?.nameEn}</TableCell>
                          <TableCell className="text-xs">{m.user?.fullName || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Pagination page={movPage} pageSize={15} total={movTotal} onPage={setMovPage} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── الصلاحية والتشغيلات ─── */}
        <TabsContent value="expiry">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2 mb-3">
                <Select value={batchFilter} onValueChange={(v) => { setBatchFilter(v); setBatchPage(1); }}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("app.all")}</SelectItem>
                    <SelectItem value="EXPIRING">{lang === "AR" ? "أقل من 90 يوم" : "Within 90 days"}</SelectItem>
                    <SelectItem value="EXPIRED">{t("dash.expired")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={batchBranch} onValueChange={(v) => { setBatchBranch(v); setBatchPage(1); }}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("app.all")}</SelectItem>
                    {branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "AR" ? b.name : b.nameEn}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {batches.length === 0 ? (
                <EmptyState message={t("app.noData")} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("prod.tradeName")}</TableHead>
                        <TableHead>{t("prod.batchNo")}</TableHead>
                        <TableHead>{t("prod.expiry")}</TableHead>
                        <TableHead>{t("inv.days")}</TableHead>
                        <TableHead className="text-center">{t("app.quantity")}</TableHead>
                        <TableHead className="text-end">{t("inv.costPrice")}</TableHead>
                        <TableHead>{t("app.branch")}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches.map((b) => (
                        <TableRow key={b.id} className={cn(expiryStatus(b.expiryDate) === "expired" && "bg-red-50/50 dark:bg-red-950/20")}>
                          <TableCell className="font-medium text-sm">{b.product.tradeName}</TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">{b.batchNo}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(b.expiryDate, lang)}</TableCell>
                          <TableCell>{expBadge(b.expiryDate)}</TableCell>
                          <TableCell className="text-center font-bold">{fmtQ(b.quantity)}</TableCell>
                          <TableCell className="text-end text-xs">{fmtM(b.costPrice * b.quantity)}</TableCell>
                          <TableCell className="text-xs">{lang === "AR" ? b.branch?.name : b.branch?.nameEn}</TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => { setAdjustBatch(b); setAdjustQty(String(b.quantity)); setAdjustNote(""); }}>
                              <Scale className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Pagination page={batchPage} pageSize={15} total={batchTotal} onPage={setBatchPage} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── التحويل ─── */}
        <TabsContent value="transfer">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-primary" /> {t("inv.transfer")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>{t("inv.fromBranch")}</Label>
                  <Select value={trFrom} onValueChange={(v) => { setTrFrom(v); setTrAvail(0); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "AR" ? b.name : b.nameEn}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("inv.toBranch")}</Label>
                  <Select value={trTo} onValueChange={setTrTo}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {branches.filter((b) => b.id !== trFrom).map((b) => <SelectItem key={b.id} value={b.id}>{lang === "AR" ? b.name : b.nameEn}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-6">
                  <Label>{t("prod.tradeName")}</Label>
                  <Select value={trProduct} onValueChange={(v) => { setTrProduct(v); loadTransferAvail(v); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent className="max-h-52">
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.tradeName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>{t("app.quantity")}</Label>
                  <Input type="number" min={1} value={trQty} onChange={(e) => setTrQty(e.target.value)} className="mt-1" />
                </div>
                <div className="md:col-span-2 text-xs text-muted-foreground pb-2">
                  {trProduct && <>{t("pos.available")}: <span className="font-bold text-foreground">{fmtQ(trAvail)}</span></>}
                </div>
                <div className="md:col-span-2">
                  <Button onClick={addTransferItem} className="w-full gap-1.5"><Plus className="h-4 w-4" /> {t("app.add")}</Button>
                </div>
              </div>

              {transferItems.length > 0 && (
                <>
                  <div className="space-y-2">
                    {transferItems.map((it, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded border text-sm">
                        <span className="font-medium">{it.name}</span>
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">{t("app.quantity")}: {fmtQ(it.qty)}</Badge>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setTransferItems(transferItems.filter((_, j) => j !== i))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button onClick={submitTransfer} className="w-full gap-2">
                    <ArrowLeftRight className="h-4 w-4" /> {t("inv.transfer")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── التسوية ─── */}
        <TabsContent value="adjust">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-3">{lang === "AR" ? "اختر تشغيلة من تبويب «مراقبة الصلاحية» لتعديل كميتها، أو استخدم الجدول التالي:" : "Pick a batch from the Expiry tab to adjust, or use the list below:"}</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("prod.tradeName")}</TableHead>
                      <TableHead>{t("prod.batchNo")}</TableHead>
                      <TableHead className="text-center">{t("inv.systemQty")}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.slice(0, 10).map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-sm">{b.product.tradeName}</TableCell>
                        <TableCell className="font-mono text-xs" dir="ltr">{b.batchNo}</TableCell>
                        <TableCell className="text-center font-bold">{fmtQ(b.quantity)}</TableCell>
                        <TableCell className="text-end">
                          <Button variant="outline" size="sm" onClick={() => { setAdjustBatch(b); setAdjustQty(String(b.quantity)); setAdjustNote(""); }}>
                            <Scale className="h-3.5 w-3.5" /> {t("inv.adjust")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── الجرد الفعلي ─── */}
        <TabsContent value="count">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" /> {t("inv.count")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-48">
                  <Label>{t("app.branch")}</Label>
                  <Select value={countBranch} onValueChange={setCountBranch}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "AR" ? b.name : b.nameEn}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={startCount} className="gap-2"><Search className="h-4 w-4" /> {t("inv.startCount")}</Button>
                <Input value={countNote} onChange={(e) => setCountNote(e.target.value)} placeholder={t("app.notes")} className="w-48" />
                <Button onClick={submitCount} disabled={!countItems.length} className="gap-2">
                  <ClipboardCheck className="h-4 w-4" /> {t("inv.submitCount")}
                </Button>
              </div>
              {countItems.length > 0 && (
                <ScrollArea className="max-h-96 border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("prod.tradeName")}</TableHead>
                        <TableHead>{t("prod.batchNo")}</TableHead>
                        <TableHead className="text-center">{t("inv.systemQty")}</TableHead>
                        <TableHead className="text-center">{t("inv.countedQty")}</TableHead>
                        <TableHead className="text-center">{t("inv.variance")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {countItems.map((it, i) => {
                        const v = it.countedQty - it.systemQty;
                        return (
                          <TableRow key={it.batchId} className={cn(v !== 0 && "bg-amber-50/60 dark:bg-amber-950/20")}>
                            <TableCell className="text-sm">{it.name}</TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">{it.batchNo}</TableCell>
                            <TableCell className="text-center">{fmtQ(it.systemQty)}</TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min={0}
                                value={it.countedQty}
                                onChange={(e) => {
                                  const next = [...countItems];
                                  next[i] = { ...it, countedQty: Math.max(0, Number(e.target.value)) };
                                  setCountItems(next);
                                }}
                                className="w-20 h-8 text-center mx-auto"
                              />
                            </TableCell>
                            <TableCell className={cn("text-center font-bold", v < 0 ? "text-red-500" : v > 0 ? "text-emerald-600" : "")}>
                              {v > 0 ? `+${fmtQ(v)}` : v < 0 ? fmtQ(v) : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* استلام بضاعة */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-primary" /> {t("inv.receive")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("prod.tradeName")} *</Label>
              <Select value={rForm.productId} onValueChange={(v) => {
                const p = products.find((x) => x.id === v);
                setRForm({ ...rForm, productId: v, costPrice: p ? String(p.purchasePrice) : "", shelfLocation: p?.shelfLocation || "" });
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-52">
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.tradeName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("app.branch")} *</Label>
              <Select value={rForm.branchId} onValueChange={(v) => setRForm({ ...rForm, branchId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "AR" ? b.name : b.nameEn}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>{t("prod.batchNo")} *</Label><Input dir="ltr" value={rForm.batchNo} onChange={(e) => setRForm({ ...rForm, batchNo: e.target.value })} className="mt-1 font-mono" /></div>
              <div><Label>{t("prod.expiry")} *</Label><Input type="date" value={rForm.expiryDate} onChange={(e) => setRForm({ ...rForm, expiryDate: e.target.value })} className="mt-1" /></div>
              <div><Label>{t("app.quantity")} *</Label><Input type="number" min={1} value={rForm.qty} onChange={(e) => setRForm({ ...rForm, qty: e.target.value })} className="mt-1" /></div>
              <div><Label>{t("inv.costPrice")}</Label><Input type="number" value={rForm.costPrice} onChange={(e) => setRForm({ ...rForm, costPrice: e.target.value })} className="mt-1" /></div>
              <div className="col-span-2"><Label>{t("prod.shelf")}</Label><Input value={rForm.shelfLocation} onChange={(e) => setRForm({ ...rForm, shelfLocation: e.target.value })} className="mt-1" /></div>
            </div>
            <Button onClick={receiveSubmit} className="w-full" disabled={!rForm.productId || !rForm.branchId || !rForm.batchNo || !rForm.expiryDate || !rForm.qty}>
              {t("app.add")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تسوية */}
      <Dialog open={!!adjustBatch} onOpenChange={(o) => !o && setAdjustBatch(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Scale className="h-5 w-5 text-primary" /> {t("inv.adjust")}</DialogTitle>
          </DialogHeader>
          {adjustBatch && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-muted/50 text-sm">
                <p className="font-semibold">{adjustBatch.product.tradeName}</p>
                <p className="font-mono text-xs text-muted-foreground" dir="ltr">{adjustBatch.batchNo}</p>
                <p className="text-xs mt-1">{t("inv.systemQty")}: <span className="font-bold">{fmtQ(adjustBatch.quantity)}</span></p>
              </div>
              <div>
                <Label>{t("inv.newQty")}</Label>
                <Input type="number" min={0} value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} className="mt-1" />
                {adjustQty !== "" && (
                  <p className={cn("text-xs mt-1", Number(adjustQty) - adjustBatch.quantity < 0 ? "text-red-500" : "text-emerald-600")}>
                    {t("inv.variance")}: {Number(adjustQty) - adjustBatch.quantity > 0 ? "+" : ""}{fmtQ(Number(adjustQty) - adjustBatch.quantity)}
                  </p>
                )}
              </div>
              <div><Label>{t("app.notes")}</Label><Input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className="mt-1" /></div>
              <Button onClick={submitAdjust} className="w-full">{t("app.save")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

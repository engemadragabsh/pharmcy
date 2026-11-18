"use client";

/**
 * الموردين والمشتريات — موردين، أوامر شراء، استلام GRN مع تشغيلات
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { fmtMoney, fmtDate, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Truck, ShoppingCart, Plus, Trash2, Send, XCircle, PackageCheck, Search, PackageOpen, Building,
} from "lucide-react";
import { cn } from "@/lib/utils";

const emptySupplier = { name: "", contactPerson: "", phone: "", email: "", address: "", paymentTerms: "" };

export default function SuppliersScreen() {
  const { t, lang } = useI18n();
  const { branches } = useApp();
  const [tab, setTab] = useState("suppliers");

  const fmtM = (n: number) => fmtMoney(n, lang);
  const fmtQ = (n: number) => fmtNum(n, lang);

  // ─── الموردين ───
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supQ, setSupQ] = useState("");
  const [supFormOpen, setSupFormOpen] = useState(false);
  const [supForm, setSupForm] = useState({ ...emptySupplier });
  const [editingSupplier, setEditingSupplier] = useState<any>(null);

  // ─── أوامر الشراء ───
  const [orders, setOrders] = useState<any[]>([]);
  const [poOpen, setPoOpen] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: "", branchId: "", expectedAt: "", notes: "" });
  const [poItems, setPoItems] = useState<Array<{ productId: string; name: string; qty: number; unitCost: number }>>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [poProduct, setPoProduct] = useState("");
  const [poQty, setPoQty] = useState("");
  const [poCost, setPoCost] = useState("");

  // ─── الاستلام GRN ───
  const [grnTarget, setGrnTarget] = useState<any>(null);
  const [grnLines, setGrnLines] = useState<Array<{ productId: string; productName: string; batchNo: string; expiryDate: string; qty: number; unitCost: number; receivedQty: number; orderQty: number }>>([]);
  const [grnNotes, setGrnNotes] = useState("");

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await api(`/suppliers${supQ ? `?q=${encodeURIComponent(supQ)}` : ""}`);
      setSuppliers(data.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
     
  }, [supQ]);

  const loadOrders = useCallback(async () => {
    try {
      const data = await api("/purchase-orders");
      setOrders(data.items || []);
    } catch {}
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);
  useEffect(() => { loadOrders(); }, [loadOrders, tab]);
  useEffect(() => {
    api("/products?limit=100").then((d) => setProducts(d.items || [])).catch(() => {});
  }, []);

  const saveSupplier = async () => {
    if (!supForm.name.trim()) return toast.error(t("app.required"));
    try {
      if (editingSupplier) {
        await api("/suppliers", { method: "PUT", body: { ...supForm, id: editingSupplier.id } });
      } else {
        await api("/suppliers", { method: "POST", body: supForm });
      }
      toast.success(t("app.success") + " ✓");
      setSupFormOpen(false);
      setEditingSupplier(null);
      setSupForm({ ...emptySupplier });
      loadSuppliers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const addPoItem = () => {
    const p = products.find((x) => x.id === poProduct);
    if (!p || !poQty || Number(poQty) <= 0 || !poCost) {
      toast.error(t("app.required"));
      return;
    }
    if (poItems.some((x) => x.productId === poProduct)) return toast.error(lang === "AR" ? "الصنف مضاف بالفعل" : "Already added");
    setPoItems([...poItems, { productId: p.id, name: p.tradeName, qty: Number(poQty), unitCost: Number(poCost) }]);
    setPoProduct("");
    setPoQty("");
    setPoCost("");
  };

  const createPo = async (send: boolean) => {
    if (!poForm.supplierId || !poForm.branchId || !poItems.length) {
      toast.error(t("app.required"));
      return;
    }
    try {
      await api("/purchase-orders", { method: "POST", body: { ...poForm, items: poItems, send } });
      toast.success(t("app.success") + " ✓");
      setPoOpen(false);
      setPoItems([]);
      setPoForm({ supplierId: "", branchId: "", expectedAt: "", notes: "" });
      loadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const setOrderStatus = async (id: string, status: string) => {
    try {
      await api("/purchase-orders", { method: "PUT", body: { id, status } });
      toast.success(t("app.success") + " ✓");
      loadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const openGrn = (po: any) => {
    setGrnTarget(po);
    setGrnLines(
      po.items.map((it: any) => ({
        productId: it.productId,
        productName: it.product.tradeName,
        batchNo: "",
        expiryDate: "",
        qty: Math.max(1, it.qty - it.receivedQty),
        unitCost: it.unitCost,
        receivedQty: it.receivedQty,
        orderQty: it.qty,
      }))
    );
    setGrnNotes("");
  };

  const submitGrn = async () => {
    const valid = grnLines.filter((l) => l.batchNo.trim() && l.expiryDate && l.qty > 0);
    if (!valid.length) {
      toast.error(lang === "AR" ? "أكمل بيانات التشغيلات والصلاحيات" : "Complete batch & expiry fields");
      return;
    }
    for (const l of valid) {
      if (new Date(l.expiryDate).getTime() < Date.now()) {
        toast.error(`${l.productName}: ${lang === "AR" ? "صلاحية منتهية!" : "expired batch!"}`);
        return;
      }
    }
    try {
      await api(`/purchase-orders/${grnTarget.id}/receive`, { method: "POST", body: { lines: valid, notes: grnNotes } });
      toast.success(t("app.success") + " ✓");
      setGrnTarget(null);
      loadOrders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      DRAFT: "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300 border-0",
      SENT: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0",
      PARTIALLY_RECEIVED: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0",
      RECEIVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-0",
      CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-0",
    };
    return <Badge className={map[s] || ""}>{t(`sup.status.${s}`)}</Badge>;
  };

  return (
    <div>
      <PageHeader
        icon={Truck}
        title={t("sup.title")}
        actions={
          tab === "suppliers" ? (
            <Button onClick={() => { setEditingSupplier(null); setSupForm({ ...emptySupplier }); setSupFormOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> {t("sup.add")}
            </Button>
          ) : tab === "orders" ? (
            <Button onClick={() => setPoOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> {t("sup.newOrder")}
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab} dir={lang === "AR" ? "rtl" : "ltr"}>
        <TabsList>
          <TabsTrigger value="suppliers" className="gap-1.5"><Building className="h-4 w-4" /> {t("sup.suppliers")}</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5"><ShoppingCart className="h-4 w-4" /> {t("sup.orders")}</TabsTrigger>
        </TabsList>

        {/* الموردين */}
        <TabsContent value="suppliers">
          <Card>
            <CardContent className="p-4">
              <div className="relative mb-3 max-w-sm">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={supQ} onChange={(e) => setSupQ(e.target.value)} placeholder={t("app.search")} className="ps-9" />
              </div>
              {suppliers.length === 0 ? (
                <EmptyState message={t("app.noData")} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("app.nameLabel")}</TableHead>
                        <TableHead>{t("sup.contact")}</TableHead>
                        <TableHead>{t("app.phone")}</TableHead>
                        <TableHead>{t("sup.paymentTerms")}</TableHead>
                        <TableHead className="text-end">{t("sup.balance")}</TableHead>
                        <TableHead className="text-end">{t("app.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suppliers.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <p className="font-semibold text-sm">{s.name}</p>
                            <p className="text-xs font-mono text-muted-foreground" dir="ltr">{s.code}</p>
                          </TableCell>
                          <TableCell className="text-sm">{s.contactPerson || "-"}</TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">{s.phone || "-"}</TableCell>
                          <TableCell className="text-xs">{s.paymentTerms || "-"}</TableCell>
                          <TableCell className={cn("text-end font-bold", s.balance > 0 ? "text-red-500" : "")}>{fmtM(s.balance)}</TableCell>
                          <TableCell className="text-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => { setEditingSupplier(s); setSupForm({ name: s.name, contactPerson: s.contactPerson || "", phone: s.phone || "", email: s.email || "", address: s.address || "", paymentTerms: s.paymentTerms || "" }); setSupFormOpen(true); }}
                              aria-label="edit"
                            >
                              <Send className="h-4 w-4 rotate-45" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* أوامر الشراء */}
        <TabsContent value="orders">
          <div className="space-y-3">
            {orders.length === 0 ? (
              <Card><CardContent><EmptyState message={t("app.noData")} icon={ShoppingCart} /></CardContent></Card>
            ) : (
              orders.map((po) => (
                <Card key={po.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold" dir="ltr">{po.no}</span>
                        {statusBadge(po.status)}
                        <span className="text-sm text-muted-foreground">{po.supplier?.name}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(po.createdAt, lang)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">{fmtM(po.total)}</span>
                        {po.status === "DRAFT" && (
                          <>
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => setOrderStatus(po.id, "SENT")}><Send className="h-3.5 w-3.5" /> {t("sup.send")}</Button>
                            <Button size="sm" variant="ghost" className="text-destructive gap-1" onClick={() => setOrderStatus(po.id, "CANCELLED")}><XCircle className="h-3.5 w-3.5" /> {t("sup.cancel")}</Button>
                          </>
                        )}
                        {["SENT", "PARTIALLY_RECEIVED"].includes(po.status) && (
                          <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => openGrn(po)}>
                            <PackageCheck className="h-3.5 w-3.5" /> {t("sup.receive")}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      {po.items.map((it: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/40">
                          <span>{it.product.tradeName}</span>
                          <span className="text-muted-foreground">
                            {t("app.quantity")}: {fmtQ(it.qty)} • {t("sup.receivedQty")}: <span className={it.receivedQty >= it.qty ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>{fmtQ(it.receivedQty)}</span> • {fmtM(it.unitCost)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* مورد جديد */}
      <Dialog open={supFormOpen} onOpenChange={setSupFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" /> {editingSupplier ? t("app.edit") : t("sup.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("app.nameLabel")} *</Label><Input value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("sup.contact")}</Label><Input value={supForm.contactPerson} onChange={(e) => setSupForm({ ...supForm, contactPerson: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>{t("app.phone")}</Label><Input dir="ltr" value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>{t("app.email")}</Label><Input dir="ltr" value={supForm.email} onChange={(e) => setSupForm({ ...supForm, email: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>{t("sup.paymentTerms")}</Label><Input value={supForm.paymentTerms} onChange={(e) => setSupForm({ ...supForm, paymentTerms: e.target.value })} className="mt-1" placeholder={lang === "AR" ? "آجل 30 يوم" : "Net 30"} /></div>
            <div><Label>{t("app.address")}</Label><Input value={supForm.address} onChange={(e) => setSupForm({ ...supForm, address: e.target.value })} className="mt-1" /></div>
            <Button onClick={saveSupplier} className="w-full">{t("app.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* أمر شراء جديد */}
      <Dialog open={poOpen} onOpenChange={setPoOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" /> {t("sup.newOrder")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>{t("sup.suppliers")} *</Label>
              <Select value={poForm.supplierId} onValueChange={(v) => setPoForm({ ...poForm, supplierId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-40">
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("app.branch")} *</Label>
              <Select value={poForm.branchId} onValueChange={(v) => setPoForm({ ...poForm, branchId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "AR" ? b.name : b.nameEn}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("sup.expectedAt")}</Label>
              <Input type="date" value={poForm.expectedAt} onChange={(e) => setPoForm({ ...poForm, expectedAt: e.target.value })} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-6">
              <Label>{t("prod.tradeName")}</Label>
              <Select value={poProduct} onValueChange={(v) => {
                setPoProduct(v);
                const p = products.find((x) => x.id === v);
                setPoCost(p ? String(p.purchasePrice) : "");
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-40">
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.tradeName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>{t("app.quantity")}</Label><Input type="number" min={1} value={poQty} onChange={(e) => setPoQty(e.target.value)} className="mt-1" /></div>
            <div className="col-span-2"><Label>{t("sup.unitCost")}</Label><Input type="number" value={poCost} onChange={(e) => setPoCost(e.target.value)} className="mt-1" /></div>
            <div className="col-span-2"><Button onClick={addPoItem} className="w-full gap-1"><Plus className="h-4 w-4" /></Button></div>
          </div>

          {poItems.length > 0 && (
            <ScrollArea className="max-h-44 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("prod.tradeName")}</TableHead>
                    <TableHead className="text-center">{t("app.quantity")}</TableHead>
                    <TableHead className="text-end">{t("sup.unitCost")}</TableHead>
                    <TableHead className="text-end">{t("app.total")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poItems.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{it.name}</TableCell>
                      <TableCell className="text-center">{fmtQ(it.qty)}</TableCell>
                      <TableCell className="text-end">{fmtM(it.unitCost)}</TableCell>
                      <TableCell className="text-end font-semibold">{fmtM(it.qty * it.unitCost)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setPoItems(poItems.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          <div><Label>{t("app.notes")}</Label><Input value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} className="mt-1" /></div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => createPo(false)}>{lang === "AR" ? "حفظ كمسودة" : "Save Draft"}</Button>
            <Button onClick={() => createPo(true)} className="gap-1.5"><Send className="h-4 w-4" /> {t("sup.send")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* استلام GRN */}
      <Dialog open={!!grnTarget} onOpenChange={(o) => !o && setGrnTarget(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageOpen className="h-5 w-5 text-emerald-600" />
              {t("sup.receive")} — <span className="font-mono" dir="ltr">{grnTarget?.no}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {grnLines.map((l, i) => (
              <div key={i} className="p-3 rounded-lg border space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{l.productName}</span>
                  <span className="text-xs text-muted-foreground">
                    {lang === "AR" ? "أُمر بـ" : "Ordered"} {fmtQ(l.orderQty)} • {t("sup.receivedQty")}: {fmtQ(l.receivedQty)}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs">{t("prod.batchNo")} *</Label>
                    <Input dir="ltr" value={l.batchNo} onChange={(e) => { const n = [...grnLines]; n[i] = { ...l, batchNo: e.target.value }; setGrnLines(n); }} className="mt-1 font-mono h-9" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("prod.expiry")} *</Label>
                    <Input type="date" value={l.expiryDate} onChange={(e) => { const n = [...grnLines]; n[i] = { ...l, expiryDate: e.target.value }; setGrnLines(n); }} className="mt-1 h-9" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("app.quantity")} *</Label>
                    <Input type="number" min={1} value={l.qty} onChange={(e) => { const n = [...grnLines]; n[i] = { ...l, qty: Number(e.target.value) }; setGrnLines(n); }} className="mt-1 h-9" />
                  </div>
                  <div>
                    <Label className="text-xs">{t("sup.unitCost")}</Label>
                    <Input type="number" value={l.unitCost} onChange={(e) => { const n = [...grnLines]; n[i] = { ...l, unitCost: Number(e.target.value) }; setGrnLines(n); }} className="mt-1 h-9" />
                  </div>
                </div>
              </div>
            ))}
            <Input value={grnNotes} onChange={(e) => setGrnNotes(e.target.value)} placeholder={lang === "AR" ? "ملاحظات (فاتورة المورد...)" : "Notes (supplier invoice...)" } />
            <Button onClick={submitGrn} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
              <PackageCheck className="h-4 w-4" /> {t("sup.receive")} — {fmtM(grnLines.reduce((s, l) => s + l.qty * l.unitCost, 0))}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

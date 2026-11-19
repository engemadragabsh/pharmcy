"use client";

/**
 * الوصفات الطبية — تسجيل، فحص تداخلات وحساسية، صرف، ربط بالفاتورة
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState, ConfirmDialog } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { fmtDate, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  FileText, Plus, Trash2, CheckCircle2, XCircle, Stethoscope, Search, ScanText, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RxItem { productId?: string; productName: string; dosage?: string; qty: number }

export default function PrescriptionsScreen({ onNavigate }: { onNavigate?: (m: string) => void }) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [lookupProducts, setLookupProducts] = useState<any[]>([]);

  const [rxForm, setRxForm] = useState({
    customerId: "", doctorId: "", source: "MANUAL", notes: "",
    items: [{ productId: "", productName: "", dosage: "", qty: 1 }] as RxItem[],
  });

  const [dispenseTarget, setDispenseTarget] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any>(null);

  const fmtQ = (n: number) => fmtNum(n, lang);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (q) params.set("q", q);
      const data = await api(`/prescriptions?${params}`);
      setItems(data.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setLoading(false);
     
  }, [status, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api("/doctors").then((d) => setDoctors(d.items || [])).catch(() => {});
    api("/customers?limit=100").then((d) => setCustomers(d.items || [])).catch(() => {});
  }, []);

  // فحص التداخلات في نافذة التسجيل
  useEffect(() => {
    const ids = rxForm.items.filter((i) => i.productId).map((i) => i.productId!);
    if (ids.length < 2) {
      setRxWarnings([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api("/interactions/check", { method: "POST", body: { productIds: ids, customerId: rxForm.customerId || null } });
        setRxWarnings([...(data.allergies || []).map((a: any) => `⚠ ${t("pos.allergyAlert")}: ${a.product} — ${a.ingredient}`), ...(data.interactions || []).map((x: any) => `${x.severity === "MAJOR" ? "⛔" : "⚠"} ${x.ingredients}: ${x.description}`)]);
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
     
  }, [rxForm.items, rxForm.customerId]);

  const [rxWarnings, setRxWarnings] = useState<string[]>([]);

  const searchProduct = async (term: string, idx: number) => {
    if (!term.trim()) return;
    try {
      const data = await api(`/products/lookup?q=${encodeURIComponent(term)}`);
      setLookupProducts(data.items || []);
    } catch {}
  };

  const addItemRow = () => setRxForm({ ...rxForm, items: [...rxForm.items, { productId: "", productName: "", dosage: "", qty: 1 }] });
  const removeItemRow = (idx: number) => setRxForm({ ...rxForm, items: rxForm.items.filter((_, i) => i !== idx) });
  const updateItem = (idx: number, patch: Partial<RxItem>) => {
    const next = [...rxForm.items];
    next[idx] = { ...next[idx], ...patch };
    setRxForm({ ...rxForm, items: next });
  };

  const save = async () => {
    const valid = rxForm.items.filter((i) => i.productName.trim() && i.qty > 0);
    if (!valid.length) {
      toast.error(t("rx.items"));
      return;
    }
    setSaving(true);
    try {
      await api("/prescriptions", { method: "POST", body: { ...rxForm, items: valid } });
      toast.success(t("app.success") + " ✓");
      setFormOpen(false);
      setRxForm({ customerId: "", doctorId: "", source: "MANUAL", notes: "", items: [{ productId: "", productName: "", dosage: "", qty: 1 }] });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setSaving(false);
  };

  const dispense = async () => {
    if (!dispenseTarget) return;
    try {
      await api("/prescriptions", { method: "PUT", body: { id: dispenseTarget.id, action: "dispense" } });
      toast.success(t("rx.dispensed") + " ✓");
      setDispenseTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const cancelRx = async () => {
    if (!cancelTarget) return;
    try {
      await api("/prescriptions", { method: "PUT", body: { id: cancelTarget.id, action: "cancel" } });
      toast.success(t("app.success") + " ✓");
      setCancelTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0",
      DISPENSED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-0",
      PARTIAL: "bg-teal-100 text-teal-700 border-0",
      CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-0",
    };
    return <Badge className={map[s] || ""}>{t(`rx.status.${s}`)}</Badge>;
  };

  return (
    <div>
      <PageHeader
        icon={FileText}
        title={t("rx.title")}
        actions={
          <Button onClick={() => setFormOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> {t("rx.new")}
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("app.search")} className="ps-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("app.all")}</SelectItem>
              <SelectItem value="PENDING">{t("rx.status.PENDING")}</SelectItem>
              <SelectItem value="DISPENSED">{t("rx.status.DISPENSED")}</SelectItem>
              <SelectItem value="CANCELLED">{t("rx.status.CANCELLED")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">{t("app.loading")}</div>
          ) : items.length === 0 ? (
            <EmptyState message={t("app.noData")} icon={Stethoscope} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("pos.customer")}</TableHead>
                    <TableHead>{t("rx.doctor")}</TableHead>
                    <TableHead>{t("rx.items")}</TableHead>
                    <TableHead>{t("app.status")}</TableHead>
                    <TableHead>{t("app.date")}</TableHead>
                    <TableHead className="text-end">{t("app.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((rx) => (
                    <TableRow key={rx.id}>
                      <TableCell className="font-mono font-semibold text-xs" dir="ltr">{rx.no}</TableCell>
                      <TableCell className="text-sm">{rx.customer?.name || (lang === "AR" ? "عميل نقدي" : "Walk-in")}</TableCell>
                      <TableCell className="text-xs">{rx.doctor?.name || "-"}</TableCell>
                      <TableCell className="text-xs max-w-56">
                        <p className="truncate">{rx.items.map((i: any) => i.productName).join(" • ")}</p>
                        {rx.source !== "MANUAL" && <Badge variant="outline" className="text-[10px] mt-1"><ScanText className="h-2.5 w-2.5 me-1" />{t(`rx.source.${rx.source}`)}</Badge>}
                      </TableCell>
                      <TableCell>{statusBadge(rx.status)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(rx.createdAt, lang, true)}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {rx.status === "PENDING" && (
                            <>
                              <Button variant="outline" size="sm" className="gap-1 text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10" onClick={() => setDispenseTarget(rx)}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> {t("rx.dispense")}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setCancelTarget(rx)} aria-label="cancel">
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* وصفة جديدة */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> {t("rx.new")}
            </DialogTitle>
          </DialogHeader>

          {rxWarnings.length > 0 && (
            <Alert variant="destructive" className="border-red-500">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                <ul className="space-y-1 text-xs">
                  {rxWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("pos.customer")}</Label>
              <Select value={rxForm.customerId} onValueChange={(v) => setRxForm({ ...rxForm, customerId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={t("pos.walkIn")} /></SelectTrigger>
                <SelectContent className="max-h-52">
                  <SelectItem value="none">{t("pos.walkIn")}</SelectItem>
                  {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.allergies ? ` ⚠ ${c.allergies}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("rx.doctor")}</Label>
              <Select value={rxForm.doctorId} onValueChange={(v) => setRxForm({ ...rxForm, doctorId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-52">
                  {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} {d.specialty ? `(${d.specialty})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("app.type")}</Label>
              <Select value={rxForm.source} onValueChange={(v) => setRxForm({ ...rxForm, source: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">{t("rx.source.MANUAL")}</SelectItem>
                  <SelectItem value="IMAGE">{t("rx.source.IMAGE")}</SelectItem>
                  <SelectItem value="OCR">{t("rx.source.OCR")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">{t("rx.items")}</Label>
            <div className="space-y-2">
              {rxForm.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5 relative">
                    <Input
                      value={it.productName}
                      onChange={(e) => updateItem(idx, { productName: e.target.value, productId: "" })}
                      onKeyDown={(e) => e.key === "Enter" && searchProduct(it.productName, idx)}
                      placeholder={t("rx.productName")}
                    />
                  </div>
                  <div className="col-span-3">
                    <Input value={it.dosage} onChange={(e) => updateItem(idx, { dosage: e.target.value })} placeholder={t("rx.dosage")} />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min={1} value={it.qty} onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value)) })} />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItemRow(idx)} disabled={rxForm.items.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {it.productId && <Badge variant="secondary" className="col-span-12 text-[10px]">✓ {lang === "AR" ? "مرتبط بالمخزون" : "Linked to stock"}</Badge>}
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={addItemRow} className="gap-1"><Plus className="h-3.5 w-3.5" /> {t("app.add")}</Button>
            </div>
            {lookupProducts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 p-2 rounded border bg-muted/40">
                {lookupProducts.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const idx = rxForm.items.findIndex((x) => !x.productId);
                      if (idx >= 0) updateItem(idx, { productId: p.id, productName: p.tradeName });
                      setLookupProducts([]);
                    }}
                  >
                    <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">{p.tradeName}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div><Label>{t("app.notes")}</Label><Textarea rows={2} value={rxForm.notes} onChange={(e) => setRxForm({ ...rxForm, notes: e.target.value })} className="mt-1" /></div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t("app.cancel")}</Button>
            <Button onClick={save} disabled={saving}>{saving ? t("app.loading") : t("app.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!dispenseTarget} onOpenChange={(o) => !o && setDispenseTarget(null)} title={t("rx.dispense")} message={`${dispenseTarget?.no} — ${lang === "AR" ? "سيتم خصم الكميات من المخزون وفق FEFO" : "Stock will be deducted using FEFO"}`} onConfirm={dispense} destructive={false} />
      <ConfirmDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)} title={t("rx.cancel")} message={t("app.confirmDelete")} onConfirm={cancelRx} />
    </div>
  );
}

"use client";

/**
 * إدارة الأدوية والمنتجات — CRUD + تشغيلات + بدائل + حركات
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState, Pagination, ConfirmDialog } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { fmtMoney, fmtDate, daysUntil, expiryStatus, normalizeName } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Pill, Plus, Pencil, Trash2, Eye, PackageSearch, Boxes, GitCompareArrows, Search, RefreshCw, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  barcode: string;
  tradeName: string;
  tradeNameEn?: string;
  scientificName?: string;
  category: string;
  purchasePrice: number;
  sellPrice: number;
  wholesalePrice: number;
  taxRate: number;
  minStock: number;
  reorderPoint: number;
  shelfLocation?: string;
  requiresPrescription: boolean;
  isActive: boolean;
  stock: number;
  margin: number;
  activeIngredient?: { name: string; nameEn?: string } | null;
  manufacturer?: { name: string } | null;
  dosageForm?: { name: string } | null;
  concentration?: string;
  packSize?: string;
}

interface ProductDetail extends Product {
  batches: Array<{ id: string; batchNo: string; expiryDate: string; quantity: number; costPrice: number; branch: { name: string } }>;
  alternatives: Array<{ id: string; tradeName: string; sellPrice: number; concentration?: string }>;
  movements: Array<{ id: string; type: string; quantity: number; createdAt: string; note?: string }>;
}

const emptyForm = {
  barcode: "", tradeName: "", tradeNameEn: "", scientificName: "",
  activeIngredientId: "", dosageFormId: "", unitId: "", manufacturerId: "",
  concentration: "", packSize: "", originCountry: "", category: "OTC",
  purchasePrice: "", sellPrice: "", wholesalePrice: "", taxRate: "14",
  minStock: "5", reorderPoint: "10", shelfLocation: "", requiresPrescription: false,
};

export default function ProductsScreen() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  const [masterData, setMasterData] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // فحص التكرار أثناء الإضافة/التعديل: بحث بالاسم + الباركود ومنع إضافة صنف موجود
  const [nameDup, setNameDup] = useState<Product | null>(null);
  const [barcodeDup, setBarcodeDup] = useState<Product | null>(null);
  const [nameMatches, setNameMatches] = useState<Product[]>([]);

  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fmtM = (n: number) => fmtMoney(n, lang);
  const fmtQ = (n: number) => n.toLocaleString(lang === "AR" ? "ar-EG" : "en-US");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "12" });
      if (q) params.set("q", q);
      if (category !== "all") params.set("category", category);
      const data = await api(`/products?${params}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setLoading(false);
     
  }, [page, q, category]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api("/master-data").then(setMasterData).catch(() => {});
  }, []);

  // بحث حي بالاسم أثناء الكتابة: عرض الأصناف المشابهة وكشف الصنف المكرر
  useEffect(() => {
    if (!formOpen) return;
    const name = form.tradeName.trim();
    if (name.length < 2) { setNameDup(null); setNameMatches([]); return; }
    const timer = setTimeout(async () => {
      try {
        const d = await api(`/products?q=${encodeURIComponent(name)}&limit=6`);
        const others: Product[] = (d.items || []).filter((p: Product) => !editing || p.id !== editing.id);
        const nn = normalizeName(name);
        setNameDup(others.find((p) => normalizeName(p.tradeName) === nn) || null);
        setNameMatches(others.slice(0, 5));
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [form.tradeName, formOpen, editing]);

  // فحص الباركود أثناء الكتابة: منع استخدام باركود صنف موجود
  useEffect(() => {
    if (!formOpen) return;
    const bc = form.barcode.trim();
    if (bc.length < 4) { setBarcodeDup(null); return; }
    const timer = setTimeout(async () => {
      try {
        const d = await api(`/products?q=${encodeURIComponent(bc)}&limit=5`);
        const others: Product[] = (d.items || []).filter((p: Product) => !editing || p.id !== editing.id);
        setBarcodeDup(others.find((p) => p.barcode === bc) || null);
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [form.barcode, formOpen, editing]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setNameDup(null); setBarcodeDup(null); setNameMatches([]);
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      barcode: p.barcode, tradeName: p.tradeName, tradeNameEn: p.tradeNameEn || "",
      scientificName: p.scientificName || "", activeIngredientId: "", dosageFormId: "", unitId: "", manufacturerId: "",
      concentration: p.concentration || "", packSize: p.packSize || "", originCountry: "",
      category: p.category, purchasePrice: String(p.purchasePrice), sellPrice: String(p.sellPrice),
      wholesalePrice: String(p.wholesalePrice), taxRate: String(p.taxRate),
      minStock: String(p.minStock), reorderPoint: String(p.reorderPoint),
      shelfLocation: p.shelfLocation || "", requiresPrescription: p.requiresPrescription,
    });
    setNameDup(null); setBarcodeDup(null); setNameMatches([]);
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.barcode.trim() || !form.tradeName.trim()) {
      toast.error(t("app.required"));
      return;
    }
    if (nameDup || barcodeDup) {
      toast.error(lang === "AR" ? "لا يمكن الحفظ — الصنف موجود بالفعل بالاسم أو الباركود" : "Cannot save — product already exists");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api(`/products/${editing.id}`, { method: "PUT", body: form });
        toast.success(t("app.success") + " ✓");
      } else {
        await api("/products", { method: "POST", body: form });
        toast.success(t("app.success") + " ✓");
      }
      setFormOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setSaving(false);
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await api(`/products/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(res.message || t("app.success"));
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setDeleteTarget(null);
  };

  const openDetail = async (p: Product) => {
    setDetailLoading(true);
    try {
      const d = await api(`/products/${p.id}`);
      setDetail(d);
    } catch {}
    setDetailLoading(false);
  };

  const catBadge = (cat: string) => {
    const colors: Record<string, string> = {
      RX: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0",
      OTC: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-0",
      MEDICAL_SUPPLY: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 border-0",
      COSMETIC: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border-0",
      FOOD: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0",
    };
    return <Badge className={colors[cat] || ""}>{t(`prod.cat.${cat}`)}</Badge>;
  };

  const stockBadge = (p: Product) => {
    if (p.stock === 0) return <Badge variant="destructive">{lang === "AR" ? "نفد" : "Out"}</Badge>;
    if (p.stock < p.reorderPoint) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0">{fmtQ(p.stock)} ⚠</Badge>;
    return <Badge variant="secondary">{fmtQ(p.stock)}</Badge>;
  };

  return (
    <div>
      <PageHeader
        icon={Pill}
        title={t("prod.title")}
        subtitle={`${fmtQ(total)} ${lang === "AR" ? "منتج" : "products"}`}
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> {t("prod.add")}
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={t("app.search")}
              className="ps-9"
            />
          </div>
          <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("app.all")}</SelectItem>
              <SelectItem value="RX">{t("prod.cat.RX")}</SelectItem>
              <SelectItem value="OTC">{t("prod.cat.OTC")}</SelectItem>
              <SelectItem value="MEDICAL_SUPPLY">{t("prod.cat.MEDICAL_SUPPLY")}</SelectItem>
              <SelectItem value="COSMETIC">{t("prod.cat.COSMETIC")}</SelectItem>
              <SelectItem value="FOOD">{t("prod.cat.FOOD")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} aria-label="refresh"><RefreshCw className="h-4 w-4" /></Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">{t("app.loading")}</div>
          ) : items.length === 0 ? (
            <EmptyState message={t("app.noData")} icon={PackageSearch} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("prod.tradeName")}</TableHead>
                    <TableHead>{t("prod.ingredient")}</TableHead>
                    <TableHead>{t("app.category")}</TableHead>
                    <TableHead className="text-end">{t("prod.purchasePrice")}</TableHead>
                    <TableHead className="text-end">{t("prod.sellPrice")}</TableHead>
                    <TableHead className="text-end">{t("prod.margin")}</TableHead>
                    <TableHead className="text-center">{t("prod.stock")}</TableHead>
                    <TableHead>{t("prod.shelf")}</TableHead>
                    <TableHead className="text-end">{t("app.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => (
                    <TableRow key={p.id} className={cn(!p.isActive && "opacity-50")}>
                      <TableCell>
                        <p className="font-semibold text-sm">{p.tradeName}</p>
                        <p className="text-xs text-muted-foreground font-mono" dir="ltr">{p.barcode}</p>
                      </TableCell>
                      <TableCell className="text-xs">{p.activeIngredient?.name || "-"}</TableCell>
                      <TableCell>{catBadge(p.category)}</TableCell>
                      <TableCell className="text-end text-xs">{fmtM(p.purchasePrice)}</TableCell>
                      <TableCell className="text-end font-semibold text-sm">{fmtM(p.sellPrice)}</TableCell>
                      <TableCell className="text-end text-xs text-emerald-600">{p.margin}٪</TableCell>
                      <TableCell className="text-center">{stockBadge(p)}</TableCell>
                      <TableCell className="text-xs font-mono">{p.shelfLocation || "-"}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDetail(p)} aria-label="view"><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label="edit"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(p)} aria-label="delete"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="px-4 pb-3">
            <Pagination page={page} pageSize={12} total={total} onPage={setPage} />
          </div>
        </CardContent>
      </Card>

      {/* نافذة الإضافة/التعديل */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" /> {editing ? t("prod.edit") : t("prod.add")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>{t("prod.barcode")} *</Label>
              <Input dir="ltr" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="mt-1 font-mono" />
              {barcodeDup && (
                <p className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {lang === "AR" ? `الباركود مستخدم للصنف «${barcodeDup.tradeName}» — لا يمكن التكرار` : `Barcode already used by "${barcodeDup.tradeName}"`}
                </p>
              )}
            </div>
            <div>
              <Label>{t("prod.tradeName")} *</Label>
              <Input value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} className="mt-1" />
              {nameDup ? (
                <p className="mt-1 text-xs font-medium text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {lang === "AR"
                    ? `هذا الصنف موجود بالفعل: «${nameDup.tradeName}» (باركود ${nameDup.barcode}) — لا يمكن إضافة صنف مكرر`
                    : `Product already exists: "${nameDup.tradeName}"`}
                </p>
              ) : nameMatches.length > 0 && form.tradeName.trim().length >= 2 ? (
                <div className="mt-1 rounded border bg-muted/40 p-1.5 text-xs">
                  <p className="text-muted-foreground mb-0.5">
                    {lang === "AR" ? "أصناف مشابهة موجودة — تأكد قبل الحفظ:" : "Similar products found:"}
                  </p>
                  {nameMatches.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 px-1 py-0.5">
                      <span className="font-medium">{m.tradeName}</span>
                      <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">{m.barcode}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div><Label>{t("prod.tradeNameEn")}</Label><Input dir="ltr" value={form.tradeNameEn} onChange={(e) => setForm({ ...form, tradeNameEn: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("prod.scientificName")}</Label><Input dir="ltr" value={form.scientificName} onChange={(e) => setForm({ ...form, scientificName: e.target.value })} className="mt-1" /></div>
            <div>
              <Label>{t("prod.ingredient")}</Label>
              <Select value={form.activeIngredientId} onValueChange={(v) => setForm({ ...form, activeIngredientId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-52">
                  {(masterData?.ingredients || []).map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("prod.form")}</Label>
              <Select value={form.dosageFormId} onValueChange={(v) => setForm({ ...form, dosageFormId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-52">
                  {(masterData?.forms || []).map((f: any) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("prod.manufacturer")}</Label>
              <Select value={form.manufacturerId} onValueChange={(v) => setForm({ ...form, manufacturerId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-52">
                  {(masterData?.manufacturers || []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("prod.unit")}</Label>
              <Select value={form.unitId} onValueChange={(v) => setForm({ ...form, unitId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(masterData?.units || []).map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("prod.concentration")}</Label><Input value={form.concentration} onChange={(e) => setForm({ ...form, concentration: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("prod.packSize")}</Label><Input value={form.packSize} onChange={(e) => setForm({ ...form, packSize: e.target.value })} className="mt-1" /></div>
            <div>
              <Label>{t("app.category")}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RX">{t("prod.cat.RX")}</SelectItem>
                  <SelectItem value="OTC">{t("prod.cat.OTC")}</SelectItem>
                  <SelectItem value="MEDICAL_SUPPLY">{t("prod.cat.MEDICAL_SUPPLY")}</SelectItem>
                  <SelectItem value="COSMETIC">{t("prod.cat.COSMETIC")}</SelectItem>
                  <SelectItem value="FOOD">{t("prod.cat.FOOD")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("prod.origin")}</Label><Input value={form.originCountry} onChange={(e) => setForm({ ...form, originCountry: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("prod.purchasePrice")} *</Label><Input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("prod.sellPrice")} *</Label><Input type="number" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("prod.wholesalePrice")}</Label><Input type="number" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("prod.taxRate")}</Label><Input type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("prod.minStock")}</Label><Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("prod.reorderPoint")}</Label><Input type="number" value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("prod.shelf")}</Label><Input value={form.shelfLocation} onChange={(e) => setForm({ ...form, shelfLocation: e.target.value })} className="mt-1" placeholder="A1-03" /></div>
            <label className="flex items-center gap-2 text-sm mt-2 cursor-pointer md:col-span-2">
              <Checkbox checked={form.requiresPrescription} onCheckedChange={(c) => setForm({ ...form, requiresPrescription: !!c })} />
              {t("prod.requiresRx")}
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t("app.cancel")}</Button>
            <Button onClick={save} disabled={saving || !!nameDup || !!barcodeDup}>{saving ? t("app.loading") : t("app.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تفاصيل الدواء */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailLoading || !detail ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("app.loading")}</div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <PackageSearch className="h-5 w-5 text-primary" />
                  {lang === "AR" ? detail.tradeName : detail.tradeNameEn || detail.tradeName}
                  {catBadge(detail.category)}
                  {detail.requiresPrescription && <Badge variant="outline">Rx</Badge>}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <Info label={t("prod.ingredient")} value={detail.activeIngredient?.name || "-"} />
                <Info label={t("prod.manufacturer")} value={detail.manufacturer?.name || "-"} />
                <Info label={t("prod.form")} value={detail.dosageForm?.name || "-"} />
                <Info label={t("prod.concentration")} value={detail.concentration || "-"} />
                <Info label={t("prod.packSize")} value={detail.packSize || "-"} />
                <Info label={t("prod.shelf")} value={detail.shelfLocation || "-"} />
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><Boxes className="h-4 w-4 text-primary" /> {t("prod.batches")}</h3>
                {detail.batches.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("app.noData")}</p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.batches.map((b) => {
                      const st = expiryStatus(b.expiryDate);
                      return (
                        <div key={b.id} className="flex items-center justify-between gap-2 p-2 rounded border text-sm">
                          <div>
                            <p className="font-mono text-xs" dir="ltr">{b.batchNo}</p>
                            <p className="text-[11px] text-muted-foreground">{b.branch.name}</p>
                          </div>
                          <Badge
                            variant={st === "expired" ? "destructive" : st === "week" || st === "month" ? "secondary" : "outline"}
                            className={cn(st === "week" && "bg-red-100 text-red-700 border-0", st === "month" && "bg-amber-100 text-amber-700 border-0")}
                          >
                            {fmtDate(b.expiryDate, lang)}
                          </Badge>
                          <span className="font-bold">{fmtQ(b.quantity)}</span>
                          <span className="text-xs text-muted-foreground">{fmtM(b.costPrice)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><GitCompareArrows className="h-4 w-4 text-primary" /> {t("prod.alternatives")}</h3>
                {detail.alternatives.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("prod.noAlternatives")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {detail.alternatives.map((a) => (
                      <div key={a.id} className="p-2 rounded border text-xs">
                        <p className="font-medium">{a.tradeName}</p>
                        <p className="text-muted-foreground">{a.concentration || ""} • {fmtM(a.sellPrice)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold text-sm mb-2">{t("prod.movements")}</h3>
                {detail.movements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("app.noData")}</p>
                ) : (
                  <div className="space-y-1">
                    {detail.movements.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs p-1.5 rounded border">
                        <span>{t(`inv.type.${m.type}`)}</span>
                        <span className={m.quantity < 0 ? "text-red-500 font-bold" : "text-emerald-600 font-bold"}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>
                        <span className="text-muted-foreground">{fmtDate(m.createdAt, lang, true)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title={t("app.delete")} message={t("app.confirmDelete")} onConfirm={doDelete} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded bg-muted/50">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}

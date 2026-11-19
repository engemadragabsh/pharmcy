"use client";

/**
 * الفروع والمخازن — إدارة فروع الصيدلية والمستودعات وربط المخازن بالفروع
 * الكتابة للمدير (ADMIN) فقط — مدير المخزون يعرض ويطلع على الإحصاءات
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState, StatCard } from "./shared";
import { api } from "@/lib/client-api";
import { fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Network, Building2, Warehouse, MapPin, Plus, Pencil, Trash2,
  Search, Star, Eye,
} from "lucide-react";

const emptyBranch = { code: "", name: "", nameEn: "", address: "", phone: "", isDefault: false, isActive: true };
const emptyWh = { code: "", name: "", nameEn: "", branchId: "none", location: "", phone: "", manager: "", notes: "", isMain: false, isActive: true };

export default function BranchesScreen() {
  const { t, lang } = useI18n();
  const role = useApp((s) => s.auth?.user?.role || "");
  const isAdmin = role === "ADMIN";

  const [branches, setBranches] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("branches");

  // نماذج الفروع
  const [bOpen, setBOpen] = useState(false);
  const [bEditing, setBEditing] = useState<any>(null);
  const [bForm, setBForm] = useState({ ...emptyBranch });
  const [saving, setSaving] = useState(false);

  // نماذج المخازن
  const [wOpen, setWOpen] = useState(false);
  const [wEditing, setWEditing] = useState<any>(null);
  const [wForm, setWForm] = useState({ ...emptyWh });

  // تأكيد الحذف
  const [deleteTarget, setDeleteTarget] = useState<{ type: "branch" | "warehouse"; item: any } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fmtQ = (n: number) => fmtNum(n, lang);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, w] = await Promise.all([api("/branches"), api("/warehouses")]);
      setBranches(b.items || []);
      setWarehouses(w.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // بحث محلي (بيانات رئيسية صغيرة)
  const filteredBranches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return branches;
    return branches.filter((b) =>
      [b.code, b.name, b.nameEn, b.address, b.phone].some((v: string) => v?.toLowerCase().includes(s))
    );
  }, [branches, q]);

  const filteredWarehouses = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return warehouses;
    return warehouses.filter((w) =>
      [w.code, w.name, w.nameEn, w.location, w.manager, w.branch?.name].some((v: string) => v?.toLowerCase().includes(s))
    );
  }, [warehouses, q]);

  const stats = useMemo(() => ({
    branches: branches.length,
    activeBranches: branches.filter((b) => b.isActive).length,
    warehouses: warehouses.length,
    linked: warehouses.filter((w) => w.branchId).length,
  }), [branches, warehouses]);

  // ─── حفظ فرع ───
  const saveBranch = async () => {
    if (!bForm.code.trim() || !bForm.name.trim()) { toast.error(t("app.required")); return; }
    setSaving(true);
    try {
      if (bEditing) {
        await api("/branches", { method: "PUT", body: { ...bForm, id: bEditing.id } });
      } else {
        await api("/branches", { method: "POST", body: bForm });
      }
      toast.success(t("app.success") + " ✓");
      setBOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setSaving(false);
  };

  // ─── حفظ مخزن ───
  const saveWarehouse = async () => {
    if (!wForm.code.trim() || !wForm.name.trim()) { toast.error(t("app.required")); return; }
    setSaving(true);
    const payload = { ...wForm, branchId: wForm.branchId === "none" ? null : wForm.branchId };
    try {
      if (wEditing) {
        await api("/warehouses", { method: "PUT", body: { ...payload, id: wEditing.id } });
      } else {
        await api("/warehouses", { method: "POST", body: payload });
      }
      toast.success(t("app.success") + " ✓");
      setWOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setSaving(false);
  };

  // ─── حذف ───
  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const path = deleteTarget.type === "branch" ? "/branches" : "/warehouses";
      const res = await api(`${path}?id=${deleteTarget.item.id}`, { method: "DELETE" });
      toast.success(res.message || t("app.success") + " ✓");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setDeleting(false);
  };

  const openBranchForm = (b?: any) => {
    setBEditing(b || null);
    setBForm(b ? {
      code: b.code, name: b.name, nameEn: b.nameEn || "", address: b.address || "",
      phone: b.phone || "", isDefault: !!b.isDefault, isActive: b.isActive,
    } : { ...emptyBranch });
    setBOpen(true);
  };

  const openWarehouseForm = (w?: any) => {
    setWEditing(w || null);
    setWForm(w ? {
      code: w.code, name: w.name, nameEn: w.nameEn || "",
      branchId: w.branchId || "none", location: w.location || "", phone: w.phone || "",
      manager: w.manager || "", notes: w.notes || "", isMain: !!w.isMain, isActive: w.isActive,
    } : { ...emptyWh });
    setWOpen(true);
  };

  const statusBadge = (active: boolean) => (
    active
      ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-0 text-[11px]">{t("br.active")}</Badge>
      : <Badge variant="destructive" className="text-[11px]">{t("br.inactive")}</Badge>
  );

  const mainBadge = (label: string) => (
    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0 text-[11px] gap-1">
      <Star className="h-3 w-3" /> {label}
    </Badge>
  );

  const statCell = (n: number) => <span className="font-bold text-primary text-sm">{fmtQ(n)}</span>;

  return (
    <div>
      <PageHeader
        icon={Network}
        title={t("br.title")}
        subtitle={t("br.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            {!isAdmin && (
              <Badge variant="outline" className="text-[11px] text-muted-foreground border-dashed">
                <Eye className="h-3 w-3 me-1" /> {t("br.readOnlyHint")}
              </Badge>
            )}
            {isAdmin && (
              <>
                <Button onClick={() => openBranchForm()} className="gap-2">
                  <Plus className="h-4 w-4" /> {t("br.addBranch")}
                </Button>
                <Button variant="outline" onClick={() => openWarehouseForm()} className="gap-2">
                  <Plus className="h-4 w-4" /> {t("br.addWarehouse")}
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* بطاقات الإحصاءات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard title={t("br.statBranches")} value={fmtQ(stats.branches)} icon={Building2} />
        <StatCard title={t("br.statActive")} value={fmtQ(stats.activeBranches)} icon={Building2} tone="success" />
        <StatCard title={t("br.statWarehouses")} value={fmtQ(stats.warehouses)} icon={Warehouse} />
        <StatCard title={t("br.statLinked")} value={fmtQ(stats.linked)} icon={Warehouse} tone="warning" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="branches" className="gap-1.5">
            <Building2 className="h-4 w-4" /> {t("br.tab.branches")} ({fmtQ(branches.length)})
          </TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1.5">
            <Warehouse className="h-4 w-4" /> {t("br.tab.warehouses")} ({fmtQ(warehouses.length)})
          </TabsTrigger>
        </TabsList>

        {/* ─── تبويب الفروع ─── */}
        <TabsContent value="branches">
          <Card className="mb-4">
            <CardContent className="p-3 flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-52">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t("app.search")} ${lang === "AR" ? "الكود/الاسم/الهاتف" : "code/name/phone"}`} className="ps-9" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-10 text-center text-sm text-muted-foreground">{t("app.loading")}</div>
              ) : filteredBranches.length === 0 ? (
                <EmptyState message={t("app.noData")} icon={Building2} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("app.code")}</TableHead>
                        <TableHead>{t("app.nameLabel")}</TableHead>
                        <TableHead>{t("app.phone")}</TableHead>
                        <TableHead>{t("app.address")}</TableHead>
                        <TableHead className="text-center">{t("br.users")}</TableHead>
                        <TableHead className="text-center">{t("br.warehousesCount")}</TableHead>
                        <TableHead className="text-center">{t("br.batches")}</TableHead>
                        <TableHead className="text-center">{t("br.invoices")}</TableHead>
                        <TableHead className="text-center">{t("app.status")}</TableHead>
                        {isAdmin && <TableHead className="text-end">{t("app.actions")}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBranches.map((b) => (
                        <TableRow key={b.id} className={!b.isActive ? "opacity-60" : ""}>
                          <TableCell className="font-mono text-xs" dir="ltr">{b.code}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{lang === "AR" ? b.name : b.nameEn}</span>
                              {b.isDefault && mainBadge(t("br.isDefault"))}
                            </div>
                            <p className="text-xs text-muted-foreground" dir="ltr">{lang === "AR" ? b.nameEn : b.name}</p>
                          </TableCell>
                          <TableCell className="text-sm font-mono" dir="ltr">{b.phone || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-40 truncate">{b.address || "—"}</TableCell>
                          <TableCell className="text-center">{statCell(b._count?.users || 0)}</TableCell>
                          <TableCell className="text-center">{statCell(b._count?.warehouses || 0)}</TableCell>
                          <TableCell className="text-center">{statCell(b._count?.batches || 0)}</TableCell>
                          <TableCell className="text-center">{statCell(b._count?.invoices || 0)}</TableCell>
                          <TableCell className="text-center">{statusBadge(b.isActive)}</TableCell>
                          {isAdmin && (
                            <TableCell className="text-end">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openBranchForm(b)} aria-label={t("app.edit")}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "branch", item: b })} aria-label={t("app.delete")}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── تبويب المخازن ─── */}
        <TabsContent value="warehouses">
          <Card className="mb-4">
            <CardContent className="p-3 flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-52">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t("app.search")} ${lang === "AR" ? "الكود/الاسم/المدير" : "code/name/manager"}`} className="ps-9" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-10 text-center text-sm text-muted-foreground">{t("app.loading")}</div>
              ) : filteredWarehouses.length === 0 ? (
                <EmptyState message={t("app.noData")} icon={Warehouse} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("app.code")}</TableHead>
                        <TableHead>{t("app.nameLabel")}</TableHead>
                        <TableHead>{t("br.branchLink")}</TableHead>
                        <TableHead>{t("br.location")}</TableHead>
                        <TableHead>{t("br.manager")}</TableHead>
                        <TableHead>{t("app.phone")}</TableHead>
                        <TableHead className="text-center">{t("br.batches")}</TableHead>
                        <TableHead className="text-center">{t("br.qty")}</TableHead>
                        <TableHead className="text-center">{t("app.status")}</TableHead>
                        {isAdmin && <TableHead className="text-end">{t("app.actions")}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWarehouses.map((w) => (
                        <TableRow key={w.id} className={!w.isActive ? "opacity-60" : ""}>
                          <TableCell className="font-mono text-xs" dir="ltr">{w.code}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">{lang === "AR" ? w.name : w.nameEn}</span>
                              {w.isMain && mainBadge(t("br.isMain"))}
                            </div>
                            <p className="text-xs text-muted-foreground" dir="ltr">{lang === "AR" ? w.nameEn : w.name}</p>
                          </TableCell>
                          <TableCell>
                            {w.branch ? (
                              <Badge variant="outline" className="gap-1 text-[11px]">
                                <Building2 className="h-3 w-3" /> {lang === "AR" ? w.branch.name : w.branch.nameEn}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">{t("br.noBranch")}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-36 truncate">
                            {w.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{w.location}</span> : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{w.manager || "—"}</TableCell>
                          <TableCell className="text-sm font-mono" dir="ltr">{w.phone || "—"}</TableCell>
                          <TableCell className="text-center">{statCell(w._count?.batches || 0)}</TableCell>
                          <TableCell className="text-center"><span className="font-bold text-emerald-600 text-sm">{fmtQ(w.totalQty || 0)}</span></TableCell>
                          <TableCell className="text-center">{statusBadge(w.isActive)}</TableCell>
                          {isAdmin && (
                            <TableCell className="text-end">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openWarehouseForm(w)} aria-label={t("app.edit")}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ type: "warehouse", item: w })} aria-label={t("app.delete")}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── نافذة إضافة/تعديل فرع ─── */}
      <Dialog open={bOpen} onOpenChange={setBOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> {bEditing ? t("br.editBranch") : t("br.addBranch")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("app.code")} *</Label><Input dir="ltr" value={bForm.code} onChange={(e) => setBForm({ ...bForm, code: e.target.value })} className="mt-1" placeholder="BR-003" /></div>
            <div><Label>{t("app.phone")}</Label><Input dir="ltr" value={bForm.phone} onChange={(e) => setBForm({ ...bForm, phone: e.target.value })} className="mt-1" placeholder="01012345678" /></div>
            <div><Label>{t("br.name")} *</Label><Input value={bForm.name} onChange={(e) => setBForm({ ...bForm, name: e.target.value })} className="mt-1" placeholder="فرع المعادي" /></div>
            <div><Label>{t("br.nameEn")}</Label><Input dir="ltr" value={bForm.nameEn} onChange={(e) => setBForm({ ...bForm, nameEn: e.target.value })} className="mt-1" placeholder="Maadi Branch" /></div>
            <div className="col-span-2"><Label>{t("app.address")}</Label><Input value={bForm.address} onChange={(e) => setBForm({ ...bForm, address: e.target.value })} className="mt-1" placeholder={lang === "AR" ? "9 شارع النصر، المعادي، القاهرة" : "9 El-Nasr St, Maadi, Cairo"} /></div>
            <div className="col-span-2 flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5"><Star className="h-4 w-4 text-amber-500" /> {t("br.isDefault")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("br.isDefaultHint")}</p>
              </div>
              <Switch checked={bForm.isDefault} onCheckedChange={(v) => setBForm({ ...bForm, isDefault: v })} />
            </div>
            {bEditing && (
              <div className="col-span-2 flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">{t("br.isActive")}</p>
                <Switch checked={bForm.isActive} onCheckedChange={(v) => setBForm({ ...bForm, isActive: v })} />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBOpen(false)}>{t("app.cancel")}</Button>
            <Button onClick={saveBranch} disabled={saving}>{saving ? t("app.loading") : t("app.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── نافذة إضافة/تعديل مخزن ─── */}
      <Dialog open={wOpen} onOpenChange={setWOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-primary" /> {wEditing ? t("br.editWarehouse") : t("br.addWarehouse")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("app.code")} *</Label><Input dir="ltr" value={wForm.code} onChange={(e) => setWForm({ ...wForm, code: e.target.value })} className="mt-1" placeholder="WH-002" /></div>
            <div><Label>{t("app.phone")}</Label><Input dir="ltr" value={wForm.phone} onChange={(e) => setWForm({ ...wForm, phone: e.target.value })} className="mt-1" placeholder="01098765432" /></div>
            <div><Label>{t("br.name")} *</Label><Input value={wForm.name} onChange={(e) => setWForm({ ...wForm, name: e.target.value })} className="mt-1" placeholder="مستودع التجزئة" /></div>
            <div><Label>{t("br.nameEn")}</Label><Input dir="ltr" value={wForm.nameEn} onChange={(e) => setWForm({ ...wForm, nameEn: e.target.value })} className="mt-1" placeholder="Retail Depot" /></div>
            <div className="col-span-2"><Label>{t("br.branchLink")}</Label>
              <Select value={wForm.branchId} onValueChange={(v) => setWForm({ ...wForm, branchId: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("br.noBranch")}</SelectItem>
                  {branches.filter((b) => b.isActive).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{lang === "AR" ? b.name : b.nameEn} — {b.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("br.location")}</Label><Input value={wForm.location} onChange={(e) => setWForm({ ...wForm, location: e.target.value })} className="mt-1" placeholder={lang === "AR" ? "المنطقة الصناعية، العبور" : "Industrial Zone, El-Obour"} /></div>
            <div><Label>{t("br.manager")}</Label><Input value={wForm.manager} onChange={(e) => setWForm({ ...wForm, manager: e.target.value })} className="mt-1" placeholder={lang === "AR" ? "أحمد محمود" : "Ahmed Mahmoud"} /></div>
            <div className="col-span-2"><Label>{t("app.notes")}</Label><Textarea rows={2} value={wForm.notes} onChange={(e) => setWForm({ ...wForm, notes: e.target.value })} className="mt-1" /></div>
            <div className="col-span-2 flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium flex items-center gap-1.5"><Star className="h-4 w-4 text-amber-500" /> {t("br.isMain")}</p>
              <Switch checked={wForm.isMain} onCheckedChange={(v) => setWForm({ ...wForm, isMain: v })} />
            </div>
            {wEditing && (
              <div className="col-span-2 flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">{t("br.isActive")}</p>
                <Switch checked={wForm.isActive} onCheckedChange={(v) => setWForm({ ...wForm, isActive: v })} />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setWOpen(false)}>{t("app.cancel")}</Button>
            <Button onClick={saveWarehouse} disabled={saving}>{saving ? t("app.loading") : t("app.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── تأكيد الحذف ─── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" /> {t("app.confirmDelete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "branch"
                ? `${lang === "AR" ? "الفرع" : "Branch"}: ${deleteTarget?.item?.name}`
                : `${lang === "AR" ? "المخزن" : "Warehouse"}: ${deleteTarget?.item?.name}`}
              {lang === "AR"
                ? " — إذا كان مرتبطاً ببيانات تشغيلية سيتم تعطيله بدلاً من حذفه."
                : " — if linked to operational data it will be deactivated instead of deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("app.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doDelete(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? t("app.loading") : t("app.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

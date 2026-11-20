"use client";

/**
 * الإعدادات — 12 تبويب: الملف التعريفي، الفروع، المستخدمون والصلاحيات،
 * الفواتير والضرائب، POS، المخزون، الإشعارات، النسخ الاحتياطي، التكاملات،
 * المظهر واللغة، البيانات الأساسية، سجل النشاط
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState, Pagination } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { fmtDate, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Settings as SettingsIcon, Store, Building2, Users, FileText, ScanBarcode,
  Package, Bell, DatabaseBackup, Plug, Palette, Library, ScrollText, Plus,
  Trash2, History, EyeOff, Eye, Save, RotateCcw, ShieldCheck, Lock,
  Download, HardDriveDownload,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MODULES = ["dashboard", "pos", "products", "inventory", "prescriptions", "customers", "suppliers", "finance", "hr", "reports", "settings"];
const ACTIONS = ["set.viewName", "set.createName", "set.editName", "set.deleteName", "set.exportName"];

export default function SettingsScreen() {
  const { t, lang } = useI18n();
  const { settings, setSettings, setLang, theme, setTheme } = useApp();
  const [s, setS] = useState<any>(settings);
  const [saving, setSaving] = useState(false);

  // فروع / مستخدمون / بيانات أساسية / سجلات
  const [branches, setBranches] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [userDialog, setUserDialog] = useState(false);
  const [userForm, setUserForm] = useState({ username: "", password: "", fullName: "", role: "PHARMACIST", pin: "", phone: "", branchId: "" });
  const [md, setMd] = useState<any>(null);
  const [mdDialog, setMdDialog] = useState<{ entity: string; edit?: any } | null>(null);
  const [mdForm, setMdForm] = useState({ name: "", nameEn: "", country: "", price: "", code: "", type: "PERCENT", value: "" });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [showPins, setShowPins] = useState(false);

  // النسخ الاحتياطي والاستعادة
  const [backups, setBackups] = useState<any[]>([]);
  const [bkSummary, setBkSummary] = useState<{ count: number; totalBytes: number; dir: string } | null>(null);
  const [bkBusy, setBkBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fmtQ = (n: number) => fmtNum(n, lang);

  // ─── النسخ الاحتياطي: قائمة / استعادة / تنزيل / حذف ───
  const loadBackups = useCallback(async () => {
    try {
      const b = await api("/settings/backup");
      setBackups(b.items || []);
      setBkSummary({ count: b.count, totalBytes: b.totalBytes, dir: b.dir });
    } catch {}
  }, []);

  const fmtSize = (bytes: number) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const loadAll = useCallback(async () => {
    try {
      const st = await api("/settings");
      setS(st);
      setSettings(st);
    } catch {}
    try {
      const b = await api("/branches");
      setBranches(b.items || []);
    } catch {}
    try {
      const u = await api("/users");
      setUsers(u.items || []);
    } catch {}
    try {
      const m = await api("/master-data");
      setMd(m);
    } catch {}
    try {
      const a = await api(`/audit?page=1&limit=25`);
      setAuditLogs(a.items || []);
      setAuditTotal(a.total || 0);
    } catch {}
    await loadBackups();
     
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const save = async (patch?: any) => {
    setSaving(true);
    try {
      const updated = await api("/settings", { method: "PUT", body: patch || s });
      setS(updated);
      setSettings(updated);
      toast.success(t("set.saved") + " ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setSaving(false);
  };

  const saveBranch = async (b: any) => {
    try {
      if (b.id) await api("/branches", { method: "PUT", body: b });
      else await api("/branches", { method: "POST", body: b });
      const data = await api("/branches");
      setBranches(data.items || []);
      toast.success(t("app.success") + " ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const saveUser = async () => {
    try {
      await api("/users", { method: "POST", body: userForm });
      toast.success(t("app.success") + " ✓");
      setUserDialog(false);
      setUserForm({ username: "", password: "", fullName: "", role: "PHARMACIST", pin: "", phone: "", branchId: "" });
      const u = await api("/users");
      setUsers(u.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const toggleUser = async (u: any) => {
    try {
      if (u.isActive) {
        await api(`/users?id=${u.id}`, { method: "DELETE" });
      } else {
        await api("/users", { method: "PUT", body: { id: u.id, isActive: true } });
      }
      const data = await api("/users");
      setUsers(data.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const saveMd = async () => {
    if (!mdDialog) return;
    const entity = mdDialog.entity;
    try {
      const body: any = { entity, op: mdDialog.edit ? "update" : "create", data: { ...mdForm, id: mdDialog.edit?.id } };
      if (entity === "services") body.data.price = Number(mdForm.price || 0);
      if (entity === "coupons") {
        body.data.value = Number(mdForm.value || 0);
        body.data.type = mdForm.type;
      }
      await api("/master-data", { method: "POST", body });
      toast.success(t("app.success") + " ✓");
      setMdDialog(null);
      const m = await api("/master-data");
      setMd(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const deleteMd = async (entity: string, id: string) => {
    try {
      await api("/master-data", { method: "POST", body: { entity, op: "delete", data: { id } } });
      const m = await api("/master-data");
      setMd(m);
      toast.success(t("app.delete") + " ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const runBackup = async () => {
    setBkBusy(true);
    try {
      const r = await api("/settings/backup", { method: "POST" });
      toast.success(`${t("set.bk.done")} — ${r.name}`);
      await loadBackups();
      const st = await api("/settings");
      setS(st);
      setSettings(st);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setBkBusy(false);
  };

  const downloadBackup = async (name: string) => {
    try {
      const token = useApp.getState().auth?.token;
      const res = await fetch(`/api/settings/backup?download=${encodeURIComponent(name)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(t("set.bk.downloadDone") + " ✓");
    } catch {
      toast.error(t("app.error"));
    }
  };

  const doRestore = async () => {
    if (!confirmRestore) return;
    setBkBusy(true);
    try {
      const r = await api("/settings/restore", { method: "POST", body: { name: confirmRestore } });
      toast.success(`${t("set.bk.restoreDone")} ✓ (${r.restoredCount} ${lang === "AR" ? "جدول" : "tables"})`);
      if (r.skippedCount > 0) {
        toast.warning(`${r.skippedCount} ${lang === "AR" ? "جدول تم تخطيه (اختلاف المخطط)" : "tables skipped (schema drift)"}`);
      }
      setConfirmRestore(null);
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setBkBusy(false);
  };

  const doDeleteBackup = async () => {
    if (!confirmDelete) return;
    setBkBusy(true);
    try {
      await api(`/settings/backup?name=${encodeURIComponent(confirmDelete)}`, { method: "DELETE" });
      toast.success(t("app.delete") + " ✓");
      setConfirmDelete(null);
      await loadBackups();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setBkBusy(false);
  };

  const rollback = async () => {
    try {
      await api("/settings", { method: "POST", body: { action: "rollback" } });
      toast.success(t("set.rollback") + " ✓");
      const st = await api("/settings");
      setS(st);
      setSettings(st);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const loadAudit = async (p: number) => {
    try {
      const a = await api(`/audit?page=${p}&limit=25`);
      setAuditLogs(a.items || []);
      setAuditTotal(a.total || 0);
      setAuditPage(p);
    } catch {}
  };

  const SwitchField = ({ label, field }: { label: string; field: string }) => (
    <div className="flex items-center justify-between p-2.5 rounded-lg border">
      <span className="text-sm">{label}</span>
      <Switch checked={!!s?.[field]} onCheckedChange={(c) => setS({ ...s, [field]: c })} aria-label={label} />
    </div>
  );

  const TextField = ({ label, field, type = "text", dir }: { label: string; field: string; type?: string; dir?: string }) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type={type} dir={dir} value={s?.[field] ?? ""} onChange={(e) => setS({ ...s, [field]: e.target.value })} className="mt-1 h-9" />
    </div>
  );

  const MD_TABS = [
    { key: "manufacturers", label: t("set.manufacturers") },
    { key: "ingredients", label: t("set.ingredients") },
    { key: "forms", label: t("set.forms") },
    { key: "units", label: t("set.units") },
    { key: "services", label: t("set.services") },
    { key: "coupons", label: t("set.coupons") },
  ];

  return (
    <div>
      <PageHeader
        icon={SettingsIcon}
        title={t("set.title")}
        actions={
          <>
            <Button variant="outline" onClick={rollback} className="gap-2">
              <RotateCcw className="h-4 w-4" /> {t("set.rollback")}
            </Button>
            <Button onClick={() => save()} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> {t("app.save")}
            </Button>
          </>
        }
      />

      <Tabs defaultValue="profile" dir={lang === "AR" ? "rtl" : "ltr"}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile" className="gap-1.5"><Store className="h-4 w-4" /> {t("set.tab.profile")}</TabsTrigger>
          <TabsTrigger value="branches" className="gap-1.5"><Building2 className="h-4 w-4" /> {t("set.tab.branches")}</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-4 w-4" /> {t("set.tab.users")}</TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5"><FileText className="h-4 w-4" /> {t("set.tab.invoices")}</TabsTrigger>
          <TabsTrigger value="pos" className="gap-1.5"><ScanBarcode className="h-4 w-4" /> {t("set.tab.pos")}</TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5"><Package className="h-4 w-4" /> {t("set.tab.inventory")}</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-4 w-4" /> {t("set.tab.notifications")}</TabsTrigger>
          <TabsTrigger value="backup" className="gap-1.5"><DatabaseBackup className="h-4 w-4" /> {t("set.tab.backup")}</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5"><Plug className="h-4 w-4" /> {t("set.tab.integrations")}</TabsTrigger>
          <TabsTrigger value="appearance" className="gap-1.5"><Palette className="h-4 w-4" /> {t("set.tab.appearance")}</TabsTrigger>
          <TabsTrigger value="master" className="gap-1.5"><Library className="h-4 w-4" /> {t("set.tab.master")}</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5"><ScrollText className="h-4 w-4" /> {t("set.tab.logs")}</TabsTrigger>
        </TabsList>

        {/* ─── الملف التعريفي ─── */}
        <TabsContent value="profile">
          <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField label={t("set.pharmacyName")} field="pharmacyName" />
            <TextField label={t("set.nameEn")} field="pharmacyNameEn" dir="ltr" />
            <TextField label={t("set.commercialReg")} field="commercialReg" dir="ltr" />
            <TextField label={t("set.taxNumber")} field="taxNumber" dir="ltr" />
            <TextField label={t("set.licenseNumber")} field="licenseNumber" dir="ltr" />
            <div>
              <Label className="text-xs">{t("set.licenseExpiry")}</Label>
              <Input type="date" value={s?.licenseExpiry ? String(s.licenseExpiry).slice(0, 10) : ""} onChange={(e) => setS({ ...s, licenseExpiry: e.target.value })} className="mt-1 h-9" />
            </div>
            <TextField label={t("app.phone")} field="phone" dir="ltr" />
            <TextField label={t("app.email")} field="email" dir="ltr" />
            <div className="md:col-span-2"><Label className="text-xs">{t("app.address")}</Label><Textarea rows={2} value={s?.address ?? ""} onChange={(e) => setS({ ...s, address: e.target.value })} className="mt-1" /></div>
          </CardContent></Card>
        </TabsContent>

        {/* ─── الفروع ─── */}
        <TabsContent value="branches">
          <Card><CardContent className="p-4 space-y-2">
            {branches.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border">
                <div className="flex-1 min-w-48">
                  <p className="font-semibold text-sm">{lang === "AR" ? b.name : b.nameEn}</p>
                  <p className="text-xs text-muted-foreground font-mono" dir="ltr">{b.code} • {b.address || ""}</p>
                </div>
                {b.isDefault && <Badge className="bg-emerald-600 border-0">{lang === "AR" ? "الرئيسي" : "Main"}</Badge>}
                <Badge variant={b.isActive ? "secondary" : "destructive"}>{b.isActive ? t("app.active") : t("app.inactive")}</Badge>
                <Badge variant="outline">{fmtQ(b._count?.users || 0)} {lang === "AR" ? "مستخدم" : "users"}</Badge>
                <div className="flex gap-1.5">
                  {!b.isDefault && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => saveBranch({ id: b.id, isActive: !b.isActive })}>
                        {b.isActive ? t("app.inactive") : t("app.active")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => saveBranch({ id: b.id, isDefault: true })}>
                        {lang === "AR" ? "تعيين رئيسي" : "Set Main"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        {/* ─── المستخدمون والصلاحيات ─── */}
        <TabsContent value="users">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> {t("set.users")}</CardTitle>
                <Button size="sm" onClick={() => setUserDialog(true)} className="gap-1.5"><Plus className="h-4 w-4" /> {t("set.addUser")}</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("set.username")}</TableHead>
                        <TableHead>{t("app.nameLabel")}</TableHead>
                        <TableHead>{t("set.role")}</TableHead>
                        <TableHead>{t("set.quickPin")}</TableHead>
                        <TableHead>{t("app.branch")}</TableHead>
                        <TableHead>{lang === "AR" ? "آخر دخول" : "Last Login"}</TableHead>
                        <TableHead>{t("app.status")}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-mono text-sm" dir="ltr">{u.username}</TableCell>
                          <TableCell className="text-sm">{u.fullName}</TableCell>
                          <TableCell><Badge variant="secondary">{t(`role.${u.role}`)}</Badge></TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">
                            {u.pin ? (showPins ? u.pin : "••••") : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{lang === "AR" ? u.branch?.name : u.branch?.nameEn || "—"}</TableCell>
                          <TableCell className="text-xs">{u.lastLoginAt ? fmtDate(u.lastLoginAt, lang, true) : "—"}</TableCell>
                          <TableCell><Badge variant={u.isActive ? "secondary" : "destructive"}>{u.isActive ? t("app.active") : t("app.inactive")}</Badge></TableCell>
                          <TableCell className="text-end">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowPins(!showPins)} aria-label="show pin">
                                {showPins ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => toggleUser(u)} aria-label="toggle">
                                <Lock className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> {t("set.permissions")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">{lang === "AR" ? "الصلاحيات مطبقة على مستوى الخادم (RBAC) لكل شاشة:" : "Server-enforced RBAC per screen:"}</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{lang === "AR" ? "الشاشة" : "Screen"}</TableHead>
                        <TableHead>{t("role.ADMIN")}</TableHead>
                        <TableHead>{t("role.PHARMACIST")}</TableHead>
                        <TableHead>{t("role.CASHIER")}</TableHead>
                        <TableHead>{t("role.ACCOUNTANT")}</TableHead>
                        <TableHead>{t("role.INVENTORY_MANAGER")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MODULES.map((m) => {
                        const permMatrix: Record<string, string[]> = {
                          dashboard: ["ADMIN", "PHARMACIST", "CASHIER", "ACCOUNTANT", "INVENTORY_MANAGER"],
                          pos: ["ADMIN", "PHARMACIST", "CASHIER"],
                          products: ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER", "CASHIER"],
                          inventory: ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER"],
                          prescriptions: ["ADMIN", "PHARMACIST", "CASHIER"],
                          customers: ["ADMIN", "PHARMACIST", "CASHIER", "ACCOUNTANT"],
                          suppliers: ["ADMIN", "INVENTORY_MANAGER", "ACCOUNTANT", "PHARMACIST"],
                          finance: ["ADMIN", "ACCOUNTANT", "CASHIER"],
                          hr: ["ADMIN", "ACCOUNTANT"],
                          reports: ["ADMIN", "PHARMACIST", "ACCOUNTANT", "INVENTORY_MANAGER"],
                          settings: ["ADMIN"],
                        };
                        return (
                          <TableRow key={m}>
                            <TableCell className="text-sm font-medium">{t(`nav.${m}`)}</TableCell>
                            {["ADMIN", "PHARMACIST", "CASHIER", "ACCOUNTANT", "INVENTORY_MANAGER"].map((r) => (
                              <TableCell key={r} className="text-center">
                                {(permMatrix[m] || []).includes(r) ? (
                                  <span className="text-emerald-600">✓</span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── الفواتير والضرائب ─── */}
        <TabsContent value="invoices">
          <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField label={t("set.invoicePrefix")} field="invoicePrefix" dir="ltr" />
            <TextField label={t("set.defaultTaxRate")} field="defaultTaxRate" type="number" />
            <TextField label={t("set.invoiceHeader")} field="invoiceHeader" />
            <TextField label={t("set.invoiceFooter")} field="invoiceFooter" />
            <div className="md:col-span-2"><Label className="text-xs">{t("set.invoiceTerms")}</Label><Textarea rows={2} value={s?.invoiceTerms ?? ""} onChange={(e) => setS({ ...s, invoiceTerms: e.target.value })} className="mt-1" /></div>
          </CardContent></Card>
        </TabsContent>

        {/* ─── POS ─── */}
        <TabsContent value="pos">
          <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("set.defaultPayment")}</Label>
              <Select value={s?.defaultPaymentMethod || "CASH"} onValueChange={(v) => setS({ ...s, defaultPaymentMethod: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">{t("pos.pay.cash")}</SelectItem>
                  <SelectItem value="VISA">{t("pos.pay.visa")}</SelectItem>
                  <SelectItem value="WALLET">{t("pos.pay.wallet")}</SelectItem>
                  <SelectItem value="CREDIT">{t("pos.pay.credit")}</SelectItem>
                  <SelectItem value="INSURANCE">{t("pos.pay.insurance")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("set.printerType")}</Label>
              <Select value={s?.printerType || "THERMAL"} onValueChange={(v) => setS({ ...s, printerType: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="THERMAL">{t("set.thermal")}</SelectItem>
                  <SelectItem value="A4">A4 / PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TextField label={t("set.loyaltyEarnRate")} field="loyaltyEarnRate" type="number" />
            <TextField label={t("set.loyaltyRedeemRate")} field="loyaltyRedeemRate" type="number" />
            <TextField label={t("set.cashierMaxDiscount")} field="cashierMaxDiscount" type="number" />
            <SwitchField label={t("set.loyaltyEnabled")} field="loyaltyEnabled" />
          </CardContent></Card>
        </TabsContent>

        {/* ─── المخزون والتنبيهات ─── */}
        <TabsContent value="inventory">
          <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField label={t("set.defaultReorderPoint")} field="defaultReorderPoint" type="number" />
            <TextField label={t("set.expiryAlertDays")} field="expiryAlertDays" />
            <div>
              <Label className="text-xs">{t("set.stockMethod")}</Label>
              <Select value={s?.stockMethod || "FEFO"} onValueChange={(v) => setS({ ...s, stockMethod: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FEFO">FEFO</SelectItem>
                  <SelectItem value="FIFO">FIFO</SelectItem>
                  <SelectItem value="AVG">{lang === "AR" ? "متوسط مرجح" : "Weighted Average"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SwitchField label={t("set.alertLowStock")} field="alertLowStock" />
            <SwitchField label={t("set.alertExpiry")} field="alertExpiry" />
            <SwitchField label={t("set.alertPendingRx")} field="alertPendingRx" />
          </CardContent></Card>
        </TabsContent>

        {/* ─── الإشعارات ─── */}
        <TabsContent value="notifications">
          <Card><CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <SwitchField label={t("set.notifyInApp")} field="notifyInApp" />
            <SwitchField label={t("set.notifyEmail")} field="notifyEmail" />
            <SwitchField label={t("set.notifySms")} field="notifySms" />
            <SwitchField label={t("set.notifyWhatsapp")} field="notifyWhatsapp" />
            <TextField label={`${t("set.tab.notifications")} — ${lang === "AR" ? "بريد التقارير التلقائية" : "Auto reports email"}`} field="autoReportsEmail" dir="ltr" />
          </CardContent></Card>
        </TabsContent>

        {/* ─── النسخ الاحتياطي ─── */}
        <TabsContent value="backup" className="space-y-4">
          <Card><CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("set.backupSchedule")}</Label>
                <Select value={s?.backupSchedule || "DAILY"} onValueChange={(v) => setS({ ...s, backupSchedule: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANUAL">{t("set.manual")}</SelectItem>
                    <SelectItem value="DAILY">{t("set.daily")}</SelectItem>
                    <SelectItem value="WEEKLY">{t("set.weekly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("set.backupLocation")}</Label>
                <Select value={s?.backupLocation || "LOCAL"} onValueChange={(v) => setS({ ...s, backupLocation: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOCAL">{t("set.local")}</SelectItem>
                    <SelectItem value="CLOUD">{t("set.cloud")} (S3 / Drive)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/40">
              <DatabaseBackup className="h-8 w-8 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{t("set.lastBackup")}</p>
                <p className="text-xs text-muted-foreground">{s?.lastBackupAt ? fmtDate(s.lastBackupAt, lang, true) : "—"}</p>
              </div>
              <Button onClick={runBackup} disabled={bkBusy} className="gap-2"><DatabaseBackup className="h-4 w-4" /> {t("set.runBackup")}</Button>
            </div>
            {bkSummary && (
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg border text-center">
                  <p className="text-lg font-bold">{fmtQ(bkSummary.count)}</p>
                  <p className="text-[11px] text-muted-foreground">{t("set.bk.count")}</p>
                </div>
                <div className="p-2.5 rounded-lg border text-center">
                  <p className="text-lg font-bold">{fmtSize(bkSummary.totalBytes)}</p>
                  <p className="text-[11px] text-muted-foreground">{t("set.bk.totalSize")}</p>
                </div>
                <div className="p-2.5 rounded-lg border text-center">
                  <p className="text-[11px] font-mono break-all" dir="ltr">{bkSummary.dir}</p>
                  <p className="text-[11px] text-muted-foreground">{t("set.bk.dir")}</p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              {lang === "AR" ? "كل تعديل للإعدادات يُحفظ نسخة منه تلقائياً — يمكنك التراجع من زر «التراجع لآخر إعداد» أعلى الشاشة." : "Every settings change is snapshotted — use Rollback above to revert."}
            </p>
          </CardContent></Card>

          {/* قائمة النسخ المحفوظة */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><HardDriveDownload className="h-4 w-4 text-primary" /> {t("set.bk.list")}</CardTitle></CardHeader>
            <CardContent>
              {backups.length === 0 ? (
                <EmptyState icon={DatabaseBackup} message={t("set.bk.empty")} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("set.bk.name")}</TableHead>
                      <TableHead className="w-24">{t("set.bk.size")}</TableHead>
                      <TableHead className="w-44">{t("set.bk.date")}</TableHead>
                      <TableHead className="w-56 text-end">{t("set.bk.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backups.map((b) => (
                      <TableRow key={b.name}>
                        <TableCell className="font-mono text-xs" dir="ltr">{b.name}</TableCell>
                        <TableCell className="text-xs">{fmtSize(b.sizeBytes)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(b.createdAt, lang, true)}</TableCell>
                        <TableCell className="text-end">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="default" disabled={bkBusy} onClick={() => setConfirmRestore(b.name)} className="gap-1 h-8">
                              <History className="h-3.5 w-3.5" /> {t("set.bk.restore")}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => downloadBackup(b.name)} className="gap-1 h-8">
                              <Download className="h-3.5 w-3.5" /> {t("set.bk.download")}
                            </Button>
                            <Button size="sm" variant="outline" disabled={bkBusy} onClick={() => setConfirmDelete(b.name)} className="gap-1 h-8 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* تأكيد الاستعادة */}
          <AlertDialog open={!!confirmRestore} onOpenChange={(o) => !o && setConfirmRestore(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><History className="h-5 w-5 text-amber-500" /> {t("set.bk.restoreTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block font-mono text-xs" dir="ltr">{confirmRestore}</span>
                  {t("set.bk.restoreDesc")}
                  <span className="block mt-2 flex items-center gap-1.5 text-emerald-600 font-medium"><ShieldCheck className="h-3.5 w-3.5" /> {t("set.bk.restoreNoRestart")}</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("app.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={doRestore} disabled={bkBusy}>{t("set.bk.restore")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* تأكيد الحذف */}
          <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-destructive" /> {t("set.bk.deleteTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="block font-mono text-xs" dir="ltr">{confirmDelete}</span>
                  {t("set.bk.deleteDesc")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("app.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={doDeleteBackup} disabled={bkBusy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("app.delete")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ─── التكاملات ─── */}
        <TabsContent value="integrations">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("set.paymentGateways")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <TextField label="Stripe — Publishable Key" field="stripeKey" dir="ltr" />
                <TextField label="Paymob — API Key" field="paymobKey" dir="ltr" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("set.eta")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <TextField label="ETA Client ID" field="etaClientId" dir="ltr" />
                <TextField label="ETA Secret" field="etaSecret" dir="ltr" type="password" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("set.messaging")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <TextField label="WhatsApp API Token" field="whatsappToken" dir="ltr" type="password" />
                <TextField label="SMS Provider" field="smsProvider" dir="ltr" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t("set.devices")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-2.5 rounded-lg border"><span className="text-sm flex items-center gap-2"><ScanBarcode className="h-4 w-4 text-primary" /> {t("set.barcodeScanner")}</span><Badge className="bg-emerald-600 border-0">{lang === "AR" ? "متصل" : "Connected"}</Badge></div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border"><span className="text-sm flex items-center gap-2"><ScanBarcode className="h-4 w-4 text-primary" /> {t("set.cashDrawer")}</span><Badge variant="outline">{lang === "AR" ? "ESC/POS" : "ESC/POS"}</Badge></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── المظهر واللغة ─── */}
        <TabsContent value="appearance">
          <Card><CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("set.theme")}</Label>
                <Select value={theme} onValueChange={(v) => { setTheme(v as any); document.documentElement.classList.toggle("dark", v === "dark"); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t("set.light")}</SelectItem>
                    <SelectItem value="dark">{t("set.dark")}</SelectItem>
                    <SelectItem value="system">{t("set.system")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("set.language")}</Label>
                <Select value={lang} onValueChange={(v) => setLang(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AR">{lang === "AR" ? "العربية (RTL)" : "Arabic (RTL)"}</SelectItem>
                    <SelectItem value="EN">English (LTR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("set.primaryColor")}</Label>
                <Select value={s?.primaryColor || "emerald"} onValueChange={(v) => setS({ ...s, primaryColor: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emerald"><span className="inline-block h-3 w-3 rounded-full bg-emerald-600 me-2" />Emerald</SelectItem>
                    <SelectItem value="teal"><span className="inline-block h-3 w-3 rounded-full bg-teal-600 me-2" />Teal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* ─── البيانات الأساسية ─── */}
        <TabsContent value="master">
          <Tabs defaultValue="manufacturers" dir={lang === "AR" ? "rtl" : "ltr"}>
            <TabsList className="flex-wrap h-auto">
              {MD_TABS.map((tb) => <TabsTrigger key={tb.key} value={tb.key}>{tb.label}</TabsTrigger>)}
            </TabsList>
            {MD_TABS.map((tb) => (
              <TabsContent key={tb.key} value={tb.key}>
                <Card>
                  <CardHeader className="flex-row items-center justify-between pb-3">
                    <CardTitle className="text-base">{tb.label}</CardTitle>
                    <Button size="sm" className="gap-1.5" onClick={() => { setMdForm({ name: "", nameEn: "", country: "", price: "", code: "", type: "PERCENT", value: "" }); setMdDialog({ entity: tb.key }); }}>
                      <Plus className="h-4 w-4" /> {t("app.add")}
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {(md?.[tb.key] || []).length === 0 ? (
                      <EmptyState message={t("app.noData")} />
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("app.nameLabel")}</TableHead>
                              <TableHead>{t("set.nameEn")}</TableHead>
                              {tb.key === "manufacturers" && <TableHead>{t("prod.origin")}</TableHead>}
                              {tb.key === "services" && <TableHead className="text-end">{t("app.price")}</TableHead>}
                              {tb.key === "coupons" && (
                                <>
                                  <TableHead>{t("app.type")}</TableHead>
                                  <TableHead className="text-end">{t("app.total")}</TableHead>
                                </>
                              )}
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(md?.[tb.key] || []).map((r: any) => (
                              <TableRow key={r.id}>
                                <TableCell className="text-sm font-medium">
                                  {tb.key === "coupons" ? <span className="font-mono" dir="ltr">{r.code}</span> : r.name}
                                </TableCell>
                                <TableCell className="text-xs">{r.nameEn || "—"}</TableCell>
                                {tb.key === "manufacturers" && <TableCell className="text-xs">{r.country || "—"}</TableCell>}
                                {tb.key === "services" && <TableCell className="text-end font-bold">{r.price}</TableCell>}
                                {tb.key === "coupons" && (
                                  <>
                                    <TableCell><Badge variant="outline">{r.type === "PERCENT" ? "٪" : t("pos.fixed")}</Badge></TableCell>
                                    <TableCell className="text-end font-bold">{r.value}</TableCell>
                                  </>
                                )}
                                <TableCell className="text-end">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => deleteMd(tb.key, r.id)}
                                    aria-label="delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
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
            ))}
          </Tabs>
        </TabsContent>

        {/* ─── سجل النشاط ─── */}
        <TabsContent value="logs">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-5 w-5 text-primary" /> {t("set.tab.logs")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("set.logsHint")}</p>
            </CardHeader>
            <CardContent className="p-0">
              {auditLogs.length === 0 ? (
                <EmptyState message={t("set.noLogs")} icon={ScrollText} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("app.date")}</TableHead>
                        <TableHead>{lang === "AR" ? "المستخدم" : "User"}</TableHead>
                        <TableHead>{lang === "AR" ? "الإجراء" : "Action"}</TableHead>
                        <TableHead>{lang === "AR" ? "الكيان" : "Entity"}</TableHead>
                        <TableHead>{t("app.notes")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(log.createdAt, lang, true)}</TableCell>
                          <TableCell className="text-xs font-medium">{log.userName || "—"}</TableCell>
                          <TableCell><Badge variant="outline" className="font-mono text-[10px]" dir="ltr">{log.action}</Badge></TableCell>
                          <TableCell className="text-xs">{log.entity}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-72 truncate">{log.details || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="px-4 pb-3">
                <Pagination page={auditPage} pageSize={25} total={auditTotal} onPage={loadAudit} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* مستخدم جديد */}
      <Dialog open={userDialog} onOpenChange={setUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> {t("set.addUser")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("set.username")} *</Label><Input dir="ltr" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("set.newPassword")} *</Label><Input dir="ltr" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="mt-1" /></div>
            <div className="col-span-2"><Label>{t("app.nameLabel")} *</Label><Input value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} className="mt-1" /></div>
            <div>
              <Label>{t("set.role")}</Label>
              <Select value={userForm.role} onValueChange={(v) => setUserForm({ ...userForm, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["ADMIN", "PHARMACIST", "CASHIER", "ACCOUNTANT", "INVENTORY_MANAGER"].map((r) => (
                    <SelectItem key={r} value={r}>{t(`role.${r}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("set.quickPin")}</Label><Input dir="ltr" maxLength={4} value={userForm.pin} onChange={(e) => setUserForm({ ...userForm, pin: e.target.value.replace(/\D/g, "") })} className="mt-1" placeholder="1234" /></div>
            <div><Label>{t("app.phone")}</Label><Input dir="ltr" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} className="mt-1" /></div>
            <div>
              <Label>{t("app.branch")}</Label>
              <Select value={userForm.branchId} onValueChange={(v) => setUserForm({ ...userForm, branchId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{lang === "AR" ? b.name : b.nameEn}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={saveUser} className="w-full">{t("app.save")}</Button>
        </DialogContent>
      </Dialog>

      {/* بيانات أساسية — إضافة */}
      <Dialog open={!!mdDialog} onOpenChange={(o) => !o && setMdDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{mdDialog?.edit ? t("app.edit") : t("app.add")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {mdDialog?.entity !== "coupons" && (
              <>
                <div><Label>{t("app.nameLabel")} *</Label><Input value={mdForm.name} onChange={(e) => setMdForm({ ...mdForm, name: e.target.value })} className="mt-1" /></div>
                <div><Label>{t("set.nameEn")}</Label><Input dir="ltr" value={mdForm.nameEn} onChange={(e) => setMdForm({ ...mdForm, nameEn: e.target.value })} className="mt-1" /></div>
              </>
            )}
            {mdDialog?.entity === "manufacturers" && <div><Label>{t("prod.origin")}</Label><Input value={mdForm.country} onChange={(e) => setMdForm({ ...mdForm, country: e.target.value })} className="mt-1" /></div>}
            {mdDialog?.entity === "services" && <div><Label>{t("app.price")}</Label><Input type="number" value={mdForm.price} onChange={(e) => setMdForm({ ...mdForm, price: e.target.value })} className="mt-1" /></div>}
            {mdDialog?.entity === "coupons" && (
              <>
                <div><Label>{lang === "AR" ? "الكود" : "Code"} *</Label><Input dir="ltr" value={mdForm.code} onChange={(e) => setMdForm({ ...mdForm, code: e.target.value.toUpperCase() })} className="mt-1 font-mono" /></div>
                <div>
                  <Label>{t("app.type")}</Label>
                  <Select value={mdForm.type} onValueChange={(v) => setMdForm({ ...mdForm, type: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENT">{t("pos.percent")}</SelectItem>
                      <SelectItem value="FIXED">{t("pos.fixed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>{t("app.total")}</Label><Input type="number" value={mdForm.value} onChange={(e) => setMdForm({ ...mdForm, value: e.target.value })} className="mt-1" /></div>
              </>
            )}
            <Button onClick={saveMd} className="w-full">{t("app.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

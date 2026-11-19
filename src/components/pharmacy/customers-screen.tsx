"use client";

/**
 * العملاء والمرضى — ملف كامل مع الولاء والتأمين والحساسية والسجلات
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState, Pagination, paymentLabel } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { fmtMoney, fmtDate, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Users, UserRoundPlus, Eye, Search, Coins, CreditCard, AlertTriangle, HeartPulse, FileText, Pill } from "lucide-react";
import { cn } from "@/lib/utils";

const emptyForm = {
  name: "", phone: "", email: "", address: "", gender: "", type: "NORMAL",
  insuranceProvider: "", insuranceNumber: "", allergies: "", chronicDiseases: "", medicalHistory: "", notes: "",
};

export default function CustomersScreen() {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const fmtM = (n: number) => fmtMoney(n, lang);
  const fmtQ = (n: number) => fmtNum(n, lang);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "12" });
      if (q) params.set("q", q);
      if (type !== "all") params.set("type", type);
      const data = await api(`/customers?${params}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setLoading(false);
     
  }, [page, q, type]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(t("app.required"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api(`/customers/${editing.id}`, { method: "PUT", body: form });
      } else {
        await api("/customers", { method: "POST", body: form });
      }
      toast.success(t("app.success") + " ✓");
      setFormOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setSaving(false);
  };

  const openProfile = async (c: any) => {
    setProfileLoading(true);
    try {
      const d = await api(`/customers/${c.id}`);
      setProfile(d);
    } catch {}
    setProfileLoading(false);
  };

  const typeBadge = (ty: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      NORMAL: { label: t("cust.type.NORMAL"), cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-0" },
      VIP: { label: t("cust.type.VIP"), cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0" },
      INSURANCE: { label: t("cust.type.INSURANCE"), cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300 border-0" },
    };
    const v = map[ty] || map.NORMAL;
    return <Badge className={v.cls}>{v.label}</Badge>;
  };

  return (
    <div>
      <PageHeader
        icon={Users}
        title={t("cust.title")}
        subtitle={`${fmtQ(total)} ${lang === "AR" ? "عميل" : "customers"}`}
        actions={
          <Button onClick={() => { setEditing(null); setForm({ ...emptyForm }); setFormOpen(true); }} className="gap-2">
            <UserRoundPlus className="h-4 w-4" /> {t("cust.add")}
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={`${t("app.search")}${lang === "AR" ? " الاسم/الهاتف" : " name/phone"}`} className="ps-9" />
          </div>
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("app.all")}</SelectItem>
              <SelectItem value="NORMAL">{t("cust.type.NORMAL")}</SelectItem>
              <SelectItem value="VIP">{t("cust.type.VIP")}</SelectItem>
              <SelectItem value="INSURANCE">{t("cust.type.INSURANCE")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">{t("app.loading")}</div>
          ) : items.length === 0 ? (
            <EmptyState message={t("app.noData")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("app.nameLabel")}</TableHead>
                    <TableHead>{t("app.phone")}</TableHead>
                    <TableHead>{t("app.type")}</TableHead>
                    <TableHead>{t("cust.allergies")}</TableHead>
                    <TableHead className="text-center">{t("cust.loyaltyPoints")}</TableHead>
                    <TableHead className="text-center">{t("cust.creditBalance")}</TableHead>
                    <TableHead className="text-center">{t("cust.purchaseHistory")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <p className="font-semibold text-sm">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-mono" dir="ltr">{c.code}</p>
                      </TableCell>
                      <TableCell className="text-sm font-mono" dir="ltr">{c.phone || "-"}</TableCell>
                      <TableCell>{typeBadge(c.type)}</TableCell>
                      <TableCell>{c.allergies ? <Badge variant="destructive" className="text-[11px]">{c.allergies}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-center"><span className="font-bold text-emerald-600">{fmtQ(c.loyaltyPoints)}</span></TableCell>
                      <TableCell className="text-center">{c.creditBalance > 0 ? <span className="text-red-500 font-bold">{fmtM(c.creditBalance)}</span> : "—"}</TableCell>
                      <TableCell className="text-center text-xs">{fmtQ(c._count?.invoices || 0)}</TableCell>
                      <TableCell className="text-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openProfile(c)} aria-label="profile"><Eye className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="px-4 pb-3"><Pagination page={page} pageSize={12} total={total} onPage={setPage} /></div>
        </CardContent>
      </Card>

      {/* نافذة الإضافة/التعديل */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRoundPlus className="h-5 w-5 text-primary" /> {editing ? t("app.edit") : t("cust.add")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>{t("app.nameLabel")} *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("app.phone")}</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" placeholder="01012345678" /></div>
            <div><Label>{t("cust.gender")}</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{t("cust.male")}</SelectItem>
                  <SelectItem value="FEMALE">{t("cust.female")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("app.type")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">{t("cust.type.NORMAL")}</SelectItem>
                  <SelectItem value="VIP">{t("cust.type.VIP")}</SelectItem>
                  <SelectItem value="INSURANCE">{t("cust.type.INSURANCE")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === "INSURANCE" && (
              <>
                <div><Label>{t("cust.insuranceProvider")}</Label><Input value={form.insuranceProvider} onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })} className="mt-1" /></div>
                <div><Label>{t("cust.insuranceNumber")}</Label><Input dir="ltr" value={form.insuranceNumber} onChange={(e) => setForm({ ...form, insuranceNumber: e.target.value })} className="mt-1" /></div>
              </>
            )}
            <div className="col-span-2"><Label>{t("cust.allergies")}</Label><Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} className="mt-1" placeholder={lang === "AR" ? "أسبرين، بنسلين" : "Aspirin, Penicillin"} /></div>
            <div className="col-span-2"><Label>{t("cust.chronic")}</Label><Input value={form.chronicDiseases} onChange={(e) => setForm({ ...form, chronicDiseases: e.target.value })} className="mt-1" placeholder={lang === "AR" ? "سكري، ضغط" : "Diabetes, Hypertension"} /></div>
            <div className="col-span-2"><Label>{t("cust.medicalHistory")}</Label><Textarea rows={2} value={form.medicalHistory} onChange={(e) => setForm({ ...form, medicalHistory: e.target.value })} className="mt-1" /></div>
            <div className="col-span-2"><Label>{t("app.address")}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t("app.cancel")}</Button>
            <Button onClick={save} disabled={saving}>{saving ? t("app.loading") : t("app.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ملف العميل */}
      <Dialog open={!!profile} onOpenChange={(o) => !o && setProfile(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {profileLoading || !profile ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("app.loading")}</div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <Users className="h-5 w-5 text-primary" /> {profile.name}
                  {typeBadge(profile.type)}
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{profile.code}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <StatMini icon={Coins} label={t("cust.loyaltyPoints")} value={fmtQ(profile.loyaltyPoints)} tone="text-emerald-600" />
                <StatMini icon={CreditCard} label={t("cust.creditBalance")} value={fmtM(profile.creditBalance)} tone={profile.creditBalance > 0 ? "text-red-500" : ""} />
                <StatMini icon={FileText} label={lang === "AR" ? "فواتير" : "Invoices"} value={fmtQ(profile.invoices?.length || 0)} />
                <StatMini icon={Pill} label={lang === "AR" ? "وصفات" : "Prescriptions"} value={fmtQ(profile.prescriptions?.length || 0)} />
              </div>

              {profile.allergies && (
                <div className="flex items-center gap-2 p-3 rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/40 text-sm">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                  <div>
                    <p className="font-bold text-red-700 dark:text-red-400">{t("cust.allergies")}</p>
                    <p className="text-red-600 dark:text-red-300">{profile.allergies}</p>
                  </div>
                </div>
              )}

              <div className="text-sm grid grid-cols-2 gap-2">
                <p><span className="text-muted-foreground">{t("app.phone")}:</span> <span dir="ltr" className="font-mono">{profile.phone || "-"}</span></p>
                <p><span className="text-muted-foreground">{t("app.email")}:</span> {profile.email || "-"}</p>
                <p><span className="text-muted-foreground">{t("cust.chronic")}:</span> {profile.chronicDiseases || "-"}</p>
                <p><span className="text-muted-foreground">{t("cust.insuranceProvider")}:</span> {profile.insuranceProvider || "-"}</p>
              </div>

              <Separator />
              <Tabs defaultValue="invoices" dir={lang === "AR" ? "rtl" : "ltr"}>
                <TabsList className="w-full">
                  <TabsTrigger value="invoices" className="flex-1">{t("cust.purchaseHistory")}</TabsTrigger>
                  <TabsTrigger value="rx" className="flex-1">{t("cust.rxArchive")}</TabsTrigger>
                </TabsList>
                <TabsContent value="invoices" className="mt-2">
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {(profile.invoices || []).map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between text-xs p-2 rounded border">
                        <span className="font-mono font-semibold" dir="ltr">{inv.no}</span>
                        <span>{fmtDate(inv.createdAt, lang)}</span>
                        <Badge variant="outline">{paymentLabel(inv.paymentMethod, t)}</Badge>
                        <span className="font-bold">{fmtM(inv.total)}</span>
                      </div>
                    ))}
                    {!(profile.invoices || []).length && <p className="text-xs text-muted-foreground text-center py-4">{t("app.noData")}</p>}
                  </div>
                </TabsContent>
                <TabsContent value="rx" className="mt-2">
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {(profile.prescriptions || []).map((rx: any) => (
                      <div key={rx.id} className="p-2 rounded border text-xs">
                        <div className="flex justify-between">
                          <span className="font-mono font-semibold" dir="ltr">{rx.no}</span>
                          <span>{rx.doctor?.name}</span>
                          <Badge variant={rx.status === "DISPENSED" ? "secondary" : "outline"}>{t(`rx.status.${rx.status}`)}</Badge>
                          <span className="text-muted-foreground">{fmtDate(rx.createdAt, lang)}</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{rx.items.map((i: any) => i.productName).join(" • ")}</p>
                      </div>
                    ))}
                    {!(profile.prescriptions || []).length && <p className="text-xs text-muted-foreground text-center py-4">{t("app.noData")}</p>}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatMini({ icon: Icon, label, value, tone = "" }: { icon: any; label: string; value: string; tone?: string }) {
  return (
    <div className="p-2.5 rounded-lg border bg-muted/40">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className={cn("text-base font-bold mt-0.5", tone)}>{value}</p>
    </div>
  );
}

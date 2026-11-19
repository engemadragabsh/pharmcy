"use client";

/**
 * الحسابات والخزينة — ورديات، مصروفات/إيرادات، كشوف حسابات، ضريبة
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState, paymentLabel } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { fmtMoney, fmtDate, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Wallet, DoorOpen, DoorClosed, ReceiptText, Plus, TrendingUp, TrendingDown,
  FileSpreadsheet, HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function FinanceScreen() {
  const { t, lang } = useI18n();
  const { auth, branchId } = useApp();
  const [tab, setTab] = useState("shift");

  const fmtM = (n: number) => fmtMoney(n, lang);
  const fmtQ = (n: number) => fmtNum(n, lang);

  // ─── الورديات ───
  const [shifts, setShifts] = useState<any[]>([]);
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [shiftOpenDialog, setShiftOpenDialog] = useState(false);
  const [shiftCloseDialog, setShiftCloseDialog] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");

  // ─── المصروفات ───
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expTotals, setExpTotals] = useState({ expense: 0, income: 0 });
  const [expDialog, setExpDialog] = useState(false);
  const [expForm, setExpForm] = useState({ type: "EXPENSE", category: "", amount: "", note: "" });

  // ─── الكشوف ───
  const [stmtType, setStmtType] = useState<"customer" | "supplier">("customer");
  const [stmtParty, setStmtParty] = useState("");
  const [stmtData, setStmtData] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const loadShifts = useCallback(async () => {
    try {
      const data = await api("/finance?view=shifts");
      setShifts(data.items || []);
      setCurrentShift(data.open || null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
     
  }, []);

  const loadExpenses = useCallback(async () => {
    try {
      const data = await api("/finance?view=expenses");
      setExpenses(data.items || []);
      setExpTotals({ expense: data.totalExpense, income: data.totalIncome });
    } catch {}
  }, []);

  useEffect(() => { loadShifts(); }, [loadShifts, tab]);
  useEffect(() => { if (tab === "expenses") loadExpenses(); }, [tab, loadExpenses]);
  useEffect(() => {
    api("/customers?limit=100").then((d) => setCustomers(d.items || [])).catch(() => {});
    api("/suppliers").then((d) => setSuppliers(d.items || [])).catch(() => {});
  }, []);

  const openShiftNow = async () => {
    try {
      await api("/finance", { method: "POST", body: { action: "openShift", openingBalance: Number(openingBalance || 0), branchId } });
      toast.success(t("fin.openShift") + " ✓");
      setShiftOpenDialog(false);
      setOpeningBalance("");
      loadShifts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const closeShift = async () => {
    if (!currentShift) return;
    try {
      const res = await api("/finance", { method: "POST", body: { action: "closeShift", shiftId: currentShift.id, closingBalance: Number(closingBalance || 0), notes: shiftNotes } });
      toast.success(`${t("fin.closeShift")} — ${t("fin.variance")}: ${res.variance}`);
      setShiftCloseDialog(false);
      setClosingBalance("");
      setShiftNotes("");
      loadShifts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const addExpense = async () => {
    if (!expForm.category.trim() || !expForm.amount || Number(expForm.amount) <= 0) {
      toast.error(t("app.required"));
      return;
    }
    try {
      await api("/finance", { method: "POST", body: { action: "addExpense", ...expForm, amount: Number(expForm.amount), branchId } });
      toast.success(t("app.success") + " ✓");
      setExpDialog(false);
      setExpForm({ type: "EXPENSE", category: "", amount: "", note: "" });
      loadExpenses();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const loadStatement = async () => {
    if (!stmtParty) return;
    try {
      const data = await api(`/finance?view=statement&type=${stmtType}&id=${stmtParty}`);
      setStmtData(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  return (
    <div>
      <PageHeader icon={Wallet} title={t("fin.title")} />

      <Tabs value={tab} onValueChange={setTab} dir={lang === "AR" ? "rtl" : "ltr"}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="shift" className="gap-1.5"><DoorOpen className="h-4 w-4" /> {t("fin.shift")}</TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1.5"><ReceiptText className="h-4 w-4" /> {t("fin.expenses")}</TabsTrigger>
          <TabsTrigger value="statements" className="gap-1.5"><FileSpreadsheet className="h-4 w-4" /> {t("fin.statements")}</TabsTrigger>
        </TabsList>

        {/* ─── الورديات ─── */}
        <TabsContent value="shift">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle className="text-base">{t("fin.shift")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {currentShift ? (
                  <div className="p-4 rounded-lg border-2 border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/30">
                    <Badge className="bg-emerald-600 text-white border-0">{t("fin.status.OPEN")}</Badge>
                    <p className="mt-2 text-sm font-semibold">{currentShift.user.fullName}</p>
                    <p className="text-xs text-muted-foreground">{t("fin.openedAt")}: {fmtDate(currentShift.openedAt, lang, true)}</p>
                    <p className="text-sm mt-1">{t("fin.openingBalance")}: <span className="font-bold">{fmtM(currentShift.openingBalance)}</span></p>
                    <Button className="w-full mt-3 gap-2" variant="destructive" onClick={() => setShiftCloseDialog(true)}>
                      <DoorClosed className="h-4 w-4" /> {t("fin.closeShift")}
                    </Button>
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border-2 border-dashed text-center">
                    <p className="text-sm text-muted-foreground mb-3">{lang === "AR" ? "لا توجد وردية مفتوحة" : "No open shift"}</p>
                    <Button className="gap-2" onClick={() => setShiftOpenDialog(true)}>
                      <DoorOpen className="h-4 w-4" /> {t("fin.openShift")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardContent className="p-0">
                {shifts.length === 0 ? (
                  <EmptyState message={t("app.noData")} />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{lang === "AR" ? "الكاشير" : "Cashier"}</TableHead>
                          <TableHead>{t("fin.openedAt")}</TableHead>
                          <TableHead>{t("fin.closedAt")}</TableHead>
                          <TableHead className="text-end">{t("fin.openingBalance")}</TableHead>
                          <TableHead className="text-end">{t("fin.expected")}</TableHead>
                          <TableHead className="text-end">{t("fin.closingBalance")}</TableHead>
                          <TableHead className="text-end">{t("fin.variance")}</TableHead>
                          <TableHead>{t("app.status")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shifts.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-sm">{s.user.fullName}</TableCell>
                            <TableCell className="text-xs">{fmtDate(s.openedAt, lang, true)}</TableCell>
                            <TableCell className="text-xs">{s.closedAt ? fmtDate(s.closedAt, lang, true) : "—"}</TableCell>
                            <TableCell className="text-end text-xs">{fmtM(s.openingBalance)}</TableCell>
                            <TableCell className="text-end text-xs">{s.expectedBalance != null ? fmtM(s.expectedBalance) : "—"}</TableCell>
                            <TableCell className="text-end text-xs font-bold">{s.closingBalance != null ? fmtM(s.closingBalance) : "—"}</TableCell>
                            <TableCell className={cn("text-end text-xs font-bold", (s.variance || 0) < 0 ? "text-red-500" : (s.variance || 0) > 0 ? "text-amber-500" : "")}>
                              {s.variance != null ? fmtM(s.variance) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={s.status === "OPEN" ? "default" : "secondary"} className={s.status === "OPEN" ? "bg-emerald-600 border-0" : ""}>
                                {t(`fin.status.${s.status}`)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── المصروفات ─── */}
        <TabsContent value="expenses">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Card><CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 text-red-600 flex items-center justify-center"><TrendingDown className="h-5 w-5" /></div>
              <div><p className="text-xs text-muted-foreground">{t("fin.totalExpense")}</p><p className="text-lg font-bold text-red-600">{fmtM(expTotals.expense)}</p></div>
            </CardContent></Card>
            <Card><CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center"><TrendingUp className="h-5 w-5" /></div>
              <div><p className="text-xs text-muted-foreground">{t("fin.totalIncome")}</p><p className="text-lg font-bold text-emerald-600">{fmtM(expTotals.income)}</p></div>
            </CardContent></Card>
          </div>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">{t("fin.expenses")}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-500/40" onClick={() => { setExpForm({ ...expForm, type: "EXPENSE" }); setExpDialog(true); }}>
                  <Plus className="h-3.5 w-3.5" /> {t("fin.expense")}
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-emerald-600 border-emerald-500/40" onClick={() => { setExpForm({ ...expForm, type: "INCOME" }); setExpDialog(true); }}>
                  <Plus className="h-3.5 w-3.5" /> {t("fin.income")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {expenses.length === 0 ? (
                <EmptyState message={t("app.noData")} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("app.date")}</TableHead>
                        <TableHead>{t("app.type")}</TableHead>
                        <TableHead>{t("app.category")}</TableHead>
                        <TableHead>{t("app.notes")}</TableHead>
                        <TableHead className="text-end">{t("app.total")}</TableHead>
                        <TableHead>{lang === "AR" ? "المستخدم" : "User"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(e.createdAt, lang)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={e.type === "INCOME" ? "text-emerald-600 border-emerald-500/40" : "text-red-600 border-red-500/40"}>
                              {e.type === "INCOME" ? t("fin.income") : t("fin.expense")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{e.category}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-40 truncate">{e.note || "—"}</TableCell>
                          <TableCell className={cn("text-end font-bold", e.type === "INCOME" ? "text-emerald-600" : "text-red-600")}>{fmtM(e.amount)}</TableCell>
                          <TableCell className="text-xs">{e.user?.fullName || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── الكشوف ─── */}
        <TabsContent value="statements">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="w-40">
                  <Label>{t("app.type")}</Label>
                  <Select value={stmtType} onValueChange={(v) => { setStmtType(v as any); setStmtParty(""); setStmtData(null); }}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">{t("fin.customerStatement")}</SelectItem>
                      <SelectItem value="supplier">{t("fin.supplierStatement")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-52">
                  <Label>{t("app.nameLabel")}</Label>
                  <Select value={stmtParty} onValueChange={setStmtParty}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent className="max-h-44">
                      {(stmtType === "customer" ? customers : suppliers).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={loadStatement} disabled={!stmtParty} className="gap-1.5"><FileSpreadsheet className="h-4 w-4" /> {t("app.details")}</Button>
              </div>

              {stmtData && (
                <div className="space-y-2">
                  <div className="flex flex-wrap justify-between p-3 rounded-lg bg-muted/50 text-sm">
                    <span className="font-semibold">{stmtData.party.name} <span className="font-mono text-xs" dir="ltr">({stmtData.party.code})</span></span>
                    <span className={cn("font-bold", stmtData.party.balance > 0 ? "text-red-500" : "text-emerald-600")}>
                      {t("fin.balance")}: {fmtM(stmtData.party.balance)}
                    </span>
                  </div>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("app.date")}</TableHead>
                          <TableHead>#</TableHead>
                          <TableHead>{lang === "AR" ? "الوصف" : "Description"}</TableHead>
                          <TableHead className="text-end">{t("fin.debit")}</TableHead>
                          <TableHead className="text-end">{t("fin.credit")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stmtData.entries.map((e: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{fmtDate(e.date, lang)}</TableCell>
                            <TableCell className="font-mono text-xs" dir="ltr">{e.ref}</TableCell>
                            <TableCell className="text-sm">{e.description}</TableCell>
                            <TableCell className="text-end text-red-600">{e.debit ? fmtM(e.debit) : "—"}</TableCell>
                            <TableCell className="text-end text-emerald-600">{e.credit ? fmtM(e.credit) : "—"}</TableCell>
                          </TableRow>
                        ))}
                        {stmtData.entries.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs py-6">{t("app.noData")}</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* فتح وردية */}
      <Dialog open={shiftOpenDialog} onOpenChange={setShiftOpenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-primary" /> {t("fin.openShift")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("fin.openingBalance")}</Label><Input type="number" min={0} value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className="mt-1" placeholder="500" /></div>
            <Button onClick={openShiftNow} className="w-full">{t("app.confirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* إغلاق وردية */}
      <Dialog open={shiftCloseDialog} onOpenChange={setShiftCloseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DoorClosed className="h-5 w-5 text-red-500" /> {t("fin.closeShift")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded bg-muted/50 text-sm">
              {t("fin.openingBalance")}: <span className="font-bold">{fmtM(currentShift?.openingBalance || 0)}</span>
            </div>
            <div><Label>{t("fin.closingBalance")}</Label><Input type="number" min={0} value={closingBalance} onChange={(e) => setClosingBalance(e.target.value)} className="mt-1" /></div>
            <div><Label>{t("app.notes")}</Label><Input value={shiftNotes} onChange={(e) => setShiftNotes(e.target.value)} className="mt-1" /></div>
            <Button onClick={closeShift} className="w-full">{t("app.confirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* مصروف/إيراد */}
      <Dialog open={expDialog} onOpenChange={setExpDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className={cn("h-5 w-5", expForm.type === "INCOME" ? "text-emerald-600" : "text-red-500")} />
              {expForm.type === "INCOME" ? t("fin.addIncome") : t("fin.addExpense")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("app.category")} *</Label><Input value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} className="mt-1" placeholder={lang === "AR" ? "إيجار / كهرباء / صيانة" : "Rent / Utilities / Maintenance"} /></div>
            <div><Label>{t("app.total")} *</Label><Input type="number" min={1} value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("app.notes")}</Label><Input value={expForm.note} onChange={(e) => setExpForm({ ...expForm, note: e.target.value })} className="mt-1" /></div>
            <Button onClick={addExpense} className="w-full">{t("app.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

/**
 * الموارد البشرية (مبسط) — موظفون، حضور وانصراف، رواتب
 */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { fmtMoney, fmtDate, fmtNum, monthISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Users, CalendarClock, Banknote, UserRoundPlus, LogIn, LogOut, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";

const emptyEmp = { name: "", position: "", phone: "", salary: "" };

export default function HRScreen() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState("employees");
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [payrollData, setPayrollData] = useState<any>({ items: [], pending: [] });
  const [month, setMonth] = useState(monthISO());

  const [empDialog, setEmpDialog] = useState(false);
  const [empForm, setEmpForm] = useState({ ...emptyEmp });
  const [payDialog, setPayDialog] = useState<any>(null);
  const [bonuses, setBonuses] = useState("0");
  const [deductions, setDeductions] = useState("0");

  const fmtM = (n: number) => fmtMoney(n, lang);
  const fmtQ = (n: number) => fmtNum(n, lang);

  const loadEmployees = useCallback(async () => {
    try {
      const d = await api("/hr?view=employees");
      setEmployees(d.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
     
  }, []);

  const loadAttendance = useCallback(async () => {
    try {
      const d = await api("/hr?view=attendance");
      setAttendance(d.items || []);
    } catch {}
  }, []);

  const loadPayroll = useCallback(async () => {
    try {
      const d = await api(`/hr?view=payroll&month=${month}`);
      setPayrollData(d);
    } catch {}
  }, [month]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { if (tab === "attendance") loadAttendance(); }, [tab, loadAttendance]);
  useEffect(() => { if (tab === "payroll") loadPayroll(); }, [tab, loadPayroll]);

  const saveEmployee = async () => {
    if (!empForm.name.trim()) return toast.error(t("app.required"));
    try {
      await api("/hr", { method: "POST", body: { action: "saveEmployee", ...empForm, salary: Number(empForm.salary || 0) } });
      toast.success(t("app.success") + " ✓");
      setEmpDialog(false);
      setEmpForm({ ...emptyEmp });
      loadEmployees();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const check = async (employeeId: string, action: "checkIn" | "checkOut") => {
    try {
      await api("/hr", { method: "POST", body: { action, employeeId } });
      toast.success(action === "checkIn" ? t("hr.checkIn") + " ✓" : t("hr.checkOut") + " ✓");
      loadAttendance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const pay = async () => {
    if (!payDialog) return;
    try {
      await api("/hr", { method: "POST", body: { action: "payPayroll", employeeId: payDialog.id, month, bonuses: Number(bonuses || 0), deductions: Number(deductions || 0) } });
      toast.success(t("hr.pay") + " ✓");
      setPayDialog(null);
      setBonuses("0");
      setDeductions("0");
      loadPayroll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  return (
    <div>
      <PageHeader icon={Users} title={t("hr.title")} subtitle={lang === "AR" ? "وحدة مبسطة — موظفون وحضور ورواتب" : "Simplified module — staff, attendance & payroll"} />

      <Tabs value={tab} onValueChange={setTab} dir={lang === "AR" ? "rtl" : "ltr"}>
        <TabsList>
          <TabsTrigger value="employees" className="gap-1.5"><Users className="h-4 w-4" /> {t("hr.employees")}</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5"><CalendarClock className="h-4 w-4" /> {t("hr.attendance")}</TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5"><Banknote className="h-4 w-4" /> {t("hr.payroll")}</TabsTrigger>
        </TabsList>

        {/* الموظفون */}
        <TabsContent value="employees">
          <Card>
            <CardContent className="p-4">
              <Button onClick={() => setEmpDialog(true)} className="mb-3 gap-2" size="sm">
                <UserRoundPlus className="h-4 w-4" /> {t("hr.addEmployee")}
              </Button>
              {employees.length === 0 ? (
                <EmptyState message={t("app.noData")} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("app.nameLabel")}</TableHead>
                        <TableHead>{t("hr.position")}</TableHead>
                        <TableHead>{t("app.phone")}</TableHead>
                        <TableHead>{t("hr.hireDate")}</TableHead>
                        <TableHead className="text-end">{t("hr.salary")}</TableHead>
                        <TableHead>{t("app.status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-semibold text-sm">{e.name}</TableCell>
                          <TableCell className="text-sm">{e.position || "-"}</TableCell>
                          <TableCell className="font-mono text-xs" dir="ltr">{e.phone || "-"}</TableCell>
                          <TableCell className="text-xs">{fmtDate(e.hireDate, lang)}</TableCell>
                          <TableCell className="text-end font-bold">{fmtM(e.salary)}</TableCell>
                          <TableCell><Badge variant={e.isActive ? "secondary" : "destructive"}>{e.isActive ? t("app.active") : t("app.inactive")}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* الحضور */}
        <TabsContent value="attendance">
          <Card>
            <CardContent className="p-4">
              {attendance.length === 0 ? (
                <EmptyState message={lang === "AR" ? "لا سجلات حضور اليوم" : "No attendance today"} icon={CalendarClock} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("app.nameLabel")}</TableHead>
                        <TableHead>{t("hr.position")}</TableHead>
                        <TableHead>{t("hr.checkIn")}</TableHead>
                        <TableHead>{t("hr.checkOut")}</TableHead>
                        <TableHead>{t("app.status")}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attendance.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium text-sm">{a.employee?.name}</TableCell>
                          <TableCell className="text-xs">{a.employee?.position}</TableCell>
                          <TableCell className="text-xs">{a.checkIn ? fmtDate(a.checkIn, lang, true) : "—"}</TableCell>
                          <TableCell className="text-xs">{a.checkOut ? fmtDate(a.checkOut, lang, true) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={a.status === "LATE" ? "text-amber-600 border-amber-500/40" : "text-emerald-600 border-emerald-500/40"}>
                              {a.status === "LATE" ? t("hr.late") : t("hr.present")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-end">
                            <div className="flex justify-end gap-1">
                              {!a.checkIn && (
                                <Button size="sm" variant="outline" className="gap-1 text-emerald-600" onClick={() => check(a.employeeId, "checkIn")}>
                                  <LogIn className="h-3.5 w-3.5" /> {t("hr.checkIn")}
                                </Button>
                              )}
                              {a.checkIn && !a.checkOut && (
                                <Button size="sm" variant="outline" className="gap-1 text-red-500" onClick={() => check(a.employeeId, "checkOut")}>
                                  <LogOut className="h-3.5 w-3.5" /> {t("hr.checkOut")}
                                </Button>
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
        </TabsContent>

        {/* الرواتب */}
        <TabsContent value="payroll">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Label>{t("hr.month")}</Label>
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <h3 className="text-sm font-semibold mb-2">{t("hr.pending")} ({fmtQ(payrollData.pending?.length || 0)})</h3>
                  <div className="space-y-2">
                    {(payrollData.pending || []).map((e: any) => (
                      <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                        <div>
                          <p className="font-semibold">{e.name}</p>
                          <p className="text-xs text-muted-foreground">{e.position}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-primary">{fmtM(e.salary)}</span>
                          <Button size="sm" className="gap-1" onClick={() => setPayDialog(e)}><HandCoins className="h-3.5 w-3.5" /> {t("hr.pay")}</Button>
                        </div>
                      </div>
                    ))}
                    {!(payrollData.pending || []).length && <p className="text-xs text-muted-foreground py-4 text-center">{lang === "AR" ? "تم صرف كل الرواتب لهذا الشهر" : "All salaries paid for this month"}</p>}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">{t("hr.paid")} ({fmtQ(payrollData.items?.length || 0)})</h3>
                  <div className="space-y-2">
                    {(payrollData.items || []).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 text-sm">
                        <div>
                          <p className="font-semibold">{p.employee?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {lang === "AR" ? "حوافز" : "Bonus"}: {fmtM(p.bonuses)} • {lang === "AR" ? "خصومات" : "Deduct"}: {fmtM(p.deductions)}
                          </p>
                        </div>
                        <span className="font-bold text-emerald-600">{fmtM(p.netPaid)}</span>
                      </div>
                    ))}
                    {!(payrollData.items || []).length && <p className="text-xs text-muted-foreground py-4 text-center">{t("app.noData")}</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* موظف جديد */}
      <Dialog open={empDialog} onOpenChange={setEmpDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserRoundPlus className="h-5 w-5 text-primary" /> {t("hr.addEmployee")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("app.nameLabel")} *</Label><Input value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("hr.position")}</Label><Input value={empForm.position} onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("app.phone")}</Label><Input dir="ltr" value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} className="mt-1" /></div>
            <div><Label>{t("hr.salary")}</Label><Input type="number" value={empForm.salary} onChange={(e) => setEmpForm({ ...empForm, salary: e.target.value })} className="mt-1" /></div>
            <Button onClick={saveEmployee} className="w-full">{t("app.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* صرف راتب */}
      <Dialog open={!!payDialog} onOpenChange={(o) => !o && setPayDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-primary" /> {t("hr.pay")} — {payDialog?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="p-3 rounded bg-muted/50 text-sm">{t("hr.salary")}: <span className="font-bold">{fmtM(payDialog?.salary || 0)}</span></div>
            <div><Label>{t("hr.bonuses")}</Label><Input type="number" value={bonuses} onChange={(e) => setBonuses(e.target.value)} className="mt-1" /></div>
            <div><Label>{t("hr.deductions")}</Label><Input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} className="mt-1" /></div>
            <div className="text-sm font-bold text-emerald-600">
              {t("hr.netPaid")}: {fmtM((payDialog?.salary || 0) + Number(bonuses || 0) - Number(deductions || 0))}
            </div>
            <Button onClick={pay} className="w-full">{t("app.confirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

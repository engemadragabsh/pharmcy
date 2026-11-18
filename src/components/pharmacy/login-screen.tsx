"use client";

/**
 * شاشة تسجيل الدخول — مستخدم/كلمة مرور + PIN سريع + اختيار الفرع
 */
import { useState } from "react";
import { useApp, Branch, SessionUser } from "@/lib/store";
import { useI18n, useDirection } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Pill, LogIn, KeyRound, Languages, Sun, Moon, Building2,
  ShieldCheck, EyeOff, Eye, UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS: Array<{ username: string; password: string; roleKey: string }> = [
  { username: "admin", password: "Admin@123", roleKey: "role.ADMIN" },
  { username: "pharmacist", password: "Pharma@123", roleKey: "role.PHARMACIST" },
  { username: "cashier", password: "Cashier@123", roleKey: "role.CASHIER" },
  { username: "accountant", password: "Account@123", roleKey: "role.ACCOUNTANT" },
  { username: "inventory", password: "Inv@123", roleKey: "role.INVENTORY_MANAGER" },
];

export default function LoginScreen() {
  useDirection();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme, setAuth, setBranches } = useApp();
  const [mode, setMode] = useState<"password" | "pin">("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  // اختيار الفرع بعد الدخول
  const [branchDialog, setBranchDialog] = useState(false);
  const [pendingSession, setPendingSession] = useState<{ accessToken: string; refreshToken: string; user: SessionUser; branches: Branch[] } | null>(null);

  const applyThemeToggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const finishLogin = async (payload: { accessToken: string; refreshToken: string; user: SessionUser; branches: Branch[] }) => {
    setBranches(payload.branches);
    const { branchId } = useApp.getState();
    const validBranch = payload.branches.find((b) => b.id === branchId);
    const session = { token: payload.accessToken, refreshToken: payload.refreshToken, user: payload.user };
    if (!validBranch) {
      setPendingSession(payload);
      setBranchDialog(true);
      return;
    }
    setAuth(session);
  };

  const handlePasswordLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username || !password) {
      toast.error(t("auth.invalid"));
      return;
    }
    setLoading(true);
    try {
      const data = await api("/auth/login", { method: "POST", body: { username, password } });
      await finishLogin(data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("auth.invalid"));
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pin.length !== 4) return;
    setPinLoading(true);
    try {
      const data = await api("/auth/pin", { method: "POST", body: { pin } });
      await finishLogin(data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "رمز PIN غير صحيح");
    } finally {
      setPinLoading(false);
    }
  };

  const toggleLang = () => {
    setLang(lang === "AR" ? "EN" : "AR");
  };

  const cycleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
    document.documentElement.classList.toggle("dark", theme !== "dark");
  };

  return (
    <div dir={lang === "AR" ? "rtl" : "ltr"} className="min-h-screen flex bg-gradient-to-br from-emerald-50 via-background to-teal-50 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/30">
      {/* اللغة والمظهر */}
      <div className="absolute top-4 end-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={toggleLang} className="gap-1.5">
          <Languages className="h-4 w-4" /> {lang === "AR" ? "EN" : "عربي"}
        </Button>
        <Button variant="outline" size="icon" onClick={cycleTheme} aria-label="theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      {/* لوحة العلامة */}
      <div className="hidden lg:flex flex-col justify-center w-[42%] px-12 bg-primary/5 border-e relative overflow-hidden">
        <div className="absolute -top-24 -start-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 end-0 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
            <Pill className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold mb-2">{t("app.name")}</h1>
          <p className="text-lg text-muted-foreground mb-8">{t("app.system")}</p>
          <ul className="space-y-3 text-sm">
            {[
              lang === "AR" ? "نقطة بيع سريعة مع باركود و FEFO" : "Fast POS with barcode & FEFO",
              lang === "AR" ? "فاتورة إلكترونية متوافقة مع ETA" : "ETA-compliant e-invoicing",
              lang === "AR" ? "تنبيهات صلاحية ونواقص فورية" : "Real-time expiry & shortage alerts",
              lang === "AR" ? "تداخلات دوائية وحساسية المرضى" : "Drug interactions & patient allergies",
              lang === "AR" ? "تقارير PDF/Excel وطباعة حرارية 80mm" : "PDF/Excel reports & 80mm thermal printing",
            ].map((line) => (
              <li key={line} className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* النموذج */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-2">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col items-center mb-6 lg:hidden">
              <div className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-3">
                <Pill className="h-7 w-7" />
              </div>
              <h1 className="text-xl font-bold">{t("app.name")}</h1>
              <p className="text-sm text-muted-foreground">{t("app.system")}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-6">
              <Button variant={mode === "password" ? "default" : "outline"} onClick={() => setMode("password")} className="gap-2">
                <UserRound className="h-4 w-4" /> {t("auth.login")}
              </Button>
              <Button variant={mode === "pin" ? "default" : "outline"} onClick={() => setMode("pin")} className="gap-2">
                <KeyRound className="h-4 w-4" /> PIN
              </Button>
            </div>

            {mode === "password" ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <Label htmlFor="username">{t("auth.username")}</Label>
                  <Input id="username" dir="ltr" className="mt-1.5" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoComplete="username" required />
                </div>
                <div>
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <div className="relative mt-1.5">
                    <Input id="password" dir="ltr" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required className="pe-10" />
                    <button type="button" className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)} aria-label="toggle password">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={remember} onCheckedChange={(c) => setRemember(!!c)} />
                    {t("auth.remember")}
                  </label>
                  <button type="button" className="text-sm text-primary hover:underline" onClick={() => toast.info(t("auth.forgotHint"))}>
                    {t("auth.forgot")}
                  </button>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  <LogIn className="h-4 w-4" /> {loading ? t("app.loading") : t("auth.login")}
                </Button>
              </form>
            ) : (
              <form onSubmit={handlePinLogin} className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">{t("auth.pin")}</p>
                <div className="flex justify-center gap-2" dir="ltr">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={cn("h-13 w-11 rounded-lg border-2 flex items-center justify-center text-2xl font-bold", pin.length > i ? "border-primary bg-primary/5" : "border-border")}>
                      {pin.length > i ? "●" : ""}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2" dir="ltr">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) => (
                    <Button
                      key={k}
                      type="button"
                      variant="outline"
                      className="h-12 text-lg"
                      onClick={() => {
                        if (k === "C") setPin("");
                        else if (k === "⌫") setPin((p) => p.slice(0, -1));
                        else if (pin.length < 4) setPin((p) => p + k);
                      }}
                    >
                      {k}
                    </Button>
                  ))}
                </div>
                <Button type="submit" className="w-full" disabled={pin.length !== 4 || pinLoading}>
                  {pinLoading ? t("app.loading") : t("auth.login")}
                </Button>
                <p className="text-xs text-center text-muted-foreground">PIN الكاشير التجريبي: 1234</p>
              </form>
            )}

            {/* حسابات تجريبية */}
            <div className="mt-6 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> {t("auth.accountsHint")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => {
                      setMode("password");
                      setUsername(acc.username);
                      setPassword(acc.password);
                    }}
                  >
                    <Badge variant="secondary" className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors">
                      {t(acc.roleKey)}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* اختيار الفرع */}
      <Dialog open={branchDialog} onOpenChange={setBranchDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> {t("auth.selectBranch")}
            </DialogTitle>
            <DialogDescription>{t("auth.selectBranchHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(pendingSession?.branches || []).map((b) => (
              <button
                key={b.id}
                className={cn("w-full text-start p-3 rounded-lg border-2 hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-between gap-2")}
                onClick={() => {
                  useApp.getState().setBranchId(b.id);
                  if (pendingSession) setAuth({ token: pendingSession.accessToken, refreshToken: pendingSession.refreshToken, user: pendingSession.user });
                  setBranchDialog(false);
                  setPendingSession(null);
                }}
              >
                <div>
                  <p className="font-semibold text-sm">{lang === "AR" ? b.name : b.nameEn}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">{b.code}</p>
                </div>
                {b.isDefault && <Badge>{lang === "AR" ? "الرئيسي" : "Main"}</Badge>}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

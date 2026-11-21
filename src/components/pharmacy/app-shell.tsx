"use client";

/**
 * قشرة التطبيق — شريط جانبي حسب الصلاحيات، شريط علوي (فرع، إشعارات، لغة، مظهر، مستخدم)
 */
import { useEffect, useState } from "react";
import { useApp, canAccess } from "@/lib/store";
import { useI18n, useDirection, usePharmacyName } from "./shared";
import { api } from "@/lib/client-api";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  LayoutDashboard, ScanBarcode, Pill, Warehouse, FileText, Users, Truck,
  Wallet, Settings as SettingsIcon, BarChart3, Pill as PillIcon, Barcode,
  Bell, Languages, Moon, Sun, LogOut, Menu, Building2, UserRound, ChevronDown, Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtNum } from "@/lib/format";

const NAV = [
  { key: "dashboard", icon: LayoutDashboard },
  { key: "pos", icon: ScanBarcode },
  { key: "products", icon: Pill },
  { key: "labels", icon: Barcode },
  { key: "inventory", icon: Warehouse },
  { key: "prescriptions", icon: FileText },
  { key: "customers", icon: Users },
  { key: "suppliers", icon: Truck },
  { key: "finance", icon: Wallet },
  { key: "hr", icon: UserRound },
  { key: "reports", icon: BarChart3 },
  { key: "branches", icon: Network },
  { key: "settings", icon: SettingsIcon },
];

interface Notif {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function AppShell({
  active,
  onNavigate,
  children,
}: {
  active: string;
  onNavigate: (m: string) => void;
  children: React.ReactNode;
}) {
  useDirection();
  const { t, lang, setLang } = useI18n();
  const pharmacyName = usePharmacyName();
  const { auth, logout, branches, branchId, setBranchId, theme, setTheme } = useApp();
  const user = auth?.user;
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

  // نظام المظهر
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && mq.matches);
      setSystemTheme(isDark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", isDark);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // تحميل الإعدادات + الإشعارات
  useEffect(() => {
    api("/settings").then((s) => useApp.getState().setSettings(s)).catch(() => {});
    const loadNotifs = () => {
      api("/notifications").then((d) => { setNotifs(d.items || []); setUnread(d.unread || 0); }).catch(() => {});
    };
    loadNotifs();
    const timer = setInterval(loadNotifs, 60000);
    return () => clearInterval(timer);
  }, []);

  const markAllRead = async () => {
    await api("/notifications", { method: "PUT" }).catch(() => {});
    setNotifs((n) => n.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
  };

  const toggleLang = () => {
    const next = lang === "AR" ? "EN" : "AR";
    setLang(next);
  };

  const cycleTheme = () => {
    const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setTheme(next);
    const isDark = next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  };

  const doLogout = () => {
    logout();
    toast.success(lang === "AR" ? "تم تسجيل الخروج" : "Logged out");
  };

  const currentBranch = branches.find((b) => b.id === branchId);
  const accessibleNav = NAV.filter((n) => canAccess(user?.role || "", n.key));

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* الشعار */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <PillIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{pharmacyName}</p>
            <p className="text-[10px] text-muted-foreground">{lang === "AR" ? "نظام إدارة الصيدليات" : "Pharmacy PMS"}</p>
          </div>
        </div>
      </div>

      {/* التنقل */}
      <nav className="flex-1 overflow-y-auto p-2.5 space-y-1" aria-label="Main navigation">
        {accessibleNav.map((n) => {
          const Icon = n.icon;
          return (
            <button
              key={n.key}
              onClick={() => { onNavigate(n.key); setMobileOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active === n.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              )}
              aria-current={active === n.key ? "page" : undefined}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{t(`nav.${n.key}`)}</span>
            </button>
          );
        })}
      </nav>

      {/* المستخدم */}
      <div className="p-3 border-t">
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-muted/50">
          <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {user?.fullName?.slice(0, 2) || "؟"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{user?.fullName}</p>
            <p className="text-[10px] text-muted-foreground">{t(`role.${user?.role || ""}`)}</p>
          </div>
          <button onClick={doLogout} className="text-muted-foreground hover:text-destructive" aria-label={t("nav.logout")}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div dir={lang === "AR" ? "rtl" : "ltr"} className="min-h-screen flex bg-background">
        {/* الشريط الجانبي — سطح المكتب */}
        <aside className="hidden lg:flex flex-col w-60 border-e bg-card shrink-0">
          {sidebarContent}
        </aside>

        {/* القسم الرئيسي */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* الشريط العلوي */}
          <header className="sticky top-0 z-40 h-14 shrink-0 border-b bg-background/95 backdrop-blur flex items-center gap-2 px-3 md:px-4">
            {/* زر القائمة للجوال */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("nav.menu")}>
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side={lang === "AR" ? "right" : "left"} className="p-0 w-64">
                {sidebarContent}
              </SheetContent>
            </Sheet>

            {/* اختيار الفرع */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-muted text-sm font-medium">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="truncate max-w-36">{currentBranch ? (lang === "AR" ? currentBranch.name : currentBranch.nameEn) : "—"}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>{t("auth.selectBranch")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {branches.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => setBranchId(b.id)}>
                    <Building2 className="h-4 w-4 me-2 text-muted-foreground" />
                    {lang === "AR" ? b.name : b.nameEn}
                    {b.isDefault && <Badge className="ms-auto bg-emerald-600 border-0 text-[9px]">{lang === "AR" ? "رئيسي" : "Main"}</Badge>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="flex-1" />

            {/* اللغة */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleLang} aria-label="language">
                  <Languages className="h-[18px] w-[18px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{lang === "AR" ? "English" : "العربية"}</TooltipContent>
            </Tooltip>

            {/* المظهر */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={cycleTheme} aria-label="theme">
                  {systemTheme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{theme === "dark" ? t("set.light") : theme === "light" ? t("set.dark") : t("set.system")}</TooltipContent>
            </Tooltip>

            {/* الإشعارات */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label={t("nav.notifications")}>
                  <Bell className="h-[18px] w-[18px]" />
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 h-4.5 min-w-4.5 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center px-1 font-bold">
                      {fmtNum(unread, lang)}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-w-[90vw]">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm font-semibold">{t("nav.notifications")}</span>
                  {unread > 0 && (
                    <button className="text-xs text-primary hover:underline" onClick={markAllRead}>{t("nav.markAllRead")}</button>
                  )}
                </div>
                <DropdownMenuSeparator />
                <div className="max-h-80 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">{t("nav.noNotifications")}</p>
                  ) : (
                    notifs.map((n) => (
                      <div key={n.id} className={cn("px-3 py-2.5 border-b last:border-0", !n.isRead && "bg-primary/5")}>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              n.severity === "CRITICAL" ? "bg-red-500" : n.severity === "WARNING" ? "bg-amber-500" : "bg-emerald-500"
                            )}
                          />
                          <p className="text-xs font-semibold truncate">{n.title}</p>
                          <span className="ms-auto text-[10px] text-muted-foreground shrink-0">{fmtDate(n.createdAt, lang, true)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* قائمة المستخدم */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 ps-1.5 pe-2 py-1 rounded-lg hover:bg-muted">
                  <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[11px] font-bold">
                    {user?.fullName?.slice(0, 2) || "؟"}
                  </div>
                  <div className="hidden md:block text-start">
                    <p className="text-xs font-semibold leading-tight">{user?.fullName}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{t(`role.${user?.role || ""}`)}</p>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="text-sm font-semibold">{user?.fullName}</p>
                  <p className="text-xs text-muted-foreground font-normal" dir="ltr">@{user?.username}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={doLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 me-2" /> {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* المحتوى */}
          <main id="main-content" className="flex-1 p-3 md:p-5 max-w-full">
            {children}
          </main>

          {/* التذييل — shrink-0 يمنع انضغاطه، والاتجاهات محوّلة dir لضمان ترتيب سليم مع العربي */}
          <footer className="h-9 shrink-0 border-t flex items-center justify-between gap-3 px-4 text-[11px] text-muted-foreground mt-auto">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate">
                {t("nav.online")} • {pharmacyName}
                <span dir="ltr" className="tabular-nums"> v1.0</span>
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap">
              {lang === "AR" ? "جميع الحقوق محفوظة" : "All rights reserved"} © <span dir="ltr">{new Date().getFullYear()}</span>
            </span>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}

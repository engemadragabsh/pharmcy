"use client";

/**
 * الجذر — إدارة الجلسة والتنقل بين الشاشات (SPA داخل /)
 */
import { useEffect, useState } from "react";
import { useApp, canAccess } from "@/lib/store";
import { api } from "@/lib/client-api";
import LoginScreen from "./login-screen";
import AppShell from "./app-shell";
import DashboardScreen from "./dashboard-screen";
import POSScreen from "./pos-screen";
import ProductsScreen from "./products-screen";
import LabelsScreen from "./labels-screen";
import InventoryScreen from "./inventory-screen";
import PrescriptionsScreen from "./prescriptions-screen";
import CustomersScreen from "./customers-screen";
import SuppliersScreen from "./suppliers-screen";
import FinanceScreen from "./finance-screen";
import HRScreen from "./hr-screen";
import ReportsScreen from "./reports-screen";
import BranchesScreen from "./branches-screen";
import SettingsScreen from "./settings-screen";
import { ShieldAlert } from "lucide-react";

export default function PharmacyApp() {
  const auth = useApp((s) => s.auth);
  const setBranches = useApp((s) => s.setBranches);
  const [active, setActive] = useState("dashboard");

  // تحميل الفروع عند الإقلاع — الجلسة تُستعاد محلياً لكن قائمة الفروع كانت
  // تُحمّل فقط لحظة تسجيل الدخول، فبعد أي refresh تبقى فارغة في كل الشاشات
  // (كمبو الفرع في استلام بضاعة / التحويل / الجرد ومحدد الفرع بالشريط العلوي)
  useEffect(() => {
    const loadBranches = () => {
      const st = useApp.getState();
      if (!st.auth || st.branches.length > 0) return;
      api("/branches")
        .then((d) => setBranches(d.items || []))
        .catch(() => {});
    };
    loadBranches();
    window.addEventListener("focus", loadBranches);
    return () => window.removeEventListener("focus", loadBranches);
  }, [setBranches]);

  if (!auth) {
    return <LoginScreen />;
  }

  const navigate = (m: string) => {
    if (!canAccess(auth.user.role, m)) return;
    setActive(m);
  };

  const screens: Record<string, React.ReactNode> = {
    dashboard: <DashboardScreen onNavigate={navigate} />,
    pos: <POSScreen />,
    products: <ProductsScreen />,
    labels: <LabelsScreen />,
    inventory: <InventoryScreen />,
    prescriptions: <PrescriptionsScreen />,
    customers: <CustomersScreen />,
    suppliers: <SuppliersScreen />,
    finance: <FinanceScreen />,
    hr: <HRScreen />,
    reports: <ReportsScreen />,
    branches: <BranchesScreen />,
    settings: <SettingsScreen />,
  };

  // شاشة الرفض إن لم يكن الدور مسموحاً
  const content = canAccess(auth.user.role, active) ? (
    screens[active] || screens.dashboard
  ) : (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
      <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
        <ShieldAlert className="h-8 w-8 text-red-500" />
      </div>
      <p className="text-lg font-bold">لا تملك صلاحية الوصول لهذه الشاشة</p>
      <p className="text-sm text-muted-foreground">لا تملك صلاحية الوصول لهذه الشاشة — راجع مدير النظام</p>
    </div>
  );

  return (
    <AppShell active={active} onNavigate={navigate}>
      {content}
    </AppShell>
  );
}

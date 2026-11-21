/**
 * مخزن الحالة العام — Zustand مع حفظ في التخزين المحلي
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Lang } from "./i18n";

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  role: "ADMIN" | "PHARMACIST" | "CASHIER" | "ACCOUNTANT" | "INVENTORY_MANAGER";
  branchId: string | null;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  isDefault: boolean;
}

export interface CartUnit {
  id: string;
  unitName: string;
  unitNameEn?: string;
  factor: number;
  sellPrice: number;
  isBase: boolean;
  isDefault: boolean;
}

export interface CartItem {
  key: string;
  productId: string;
  name: string;
  nameEn?: string;
  qty: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  availableQty: number; // المتاح بوحدة البيع المختارة
  requiresPrescription?: boolean;
  batchId?: string;
  // Multi-UoM — وحدة البيع المختارة
  unitId?: string;
  unitName?: string;
  unitFactor?: number;
  baseAvailable?: number; // المتاح بوحدة أساسية (لإعادة الحساب عند تبديل الوحدة)
  units?: CartUnit[];
}

export interface AuthState {
  token: string;
  refreshToken: string;
  user: SessionUser;
}

interface AppState {
  auth: AuthState | null;
  lang: Lang;
  theme: "light" | "dark" | "system";
  branchId: string | null;
  branches: Branch[];
  cart: CartItem[];
  settings: any;
  // المصادقة
  setAuth: (a: AuthState | null) => void;
  logout: () => void;
  setBranches: (b: Branch[]) => void;
  setBranchId: (id: string | null) => void;
  // اللغة والمظهر
  setLang: (l: Lang) => void;
  setTheme: (t: "light" | "dark" | "system") => void;
  // السلة
  addToCart: (item: Omit<CartItem, "key" | "discount">) => void;
  updateCartQty: (key: string, qty: number) => void;
  updateCartDiscount: (key: string, discount: number) => void;
  updateCartItem: (key: string, patch: Partial<CartItem>) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
  setSettings: (s: any) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      auth: null,
      lang: "AR",
      theme: "system",
      branchId: null,
      branches: [],
      cart: [],
      settings: null,
      setAuth: (auth) => set({ auth }),
      logout: () => set({ auth: null, cart: [] }),
      setBranches: (branches) => set({ branches }),
      setBranchId: (branchId) => set({ branchId }),
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      addToCart: (item) =>
        set((state) => {
          // Multi-UoM: دمج السطر لنفس المنتج بنفس وحدة البيع فقط
          const existing = state.cart.find(
            (c) => c.productId === item.productId && (c.unitId || null) === (item.unitId || null)
          );
          if (existing) {
            const newQty = Math.min(existing.qty + item.qty, item.availableQty || 9999);
            return {
              cart: state.cart.map((c) =>
                c.key === existing.key ? { ...c, qty: newQty } : c
              ),
            };
          }
          return { cart: [...state.cart, { ...item, key: `${item.productId}-${item.unitId || "base"}-${Date.now()}`, discount: 0 }] };
        }),
      updateCartQty: (key, qty) =>
        set((state) => ({
          cart: state.cart.map((c) =>
            c.key === key ? { ...c, qty: Math.max(1, Math.min(qty, c.availableQty || 9999)) } : c
          ),
        })),
      updateCartDiscount: (key, discount) =>
        set((state) => ({
          cart: state.cart.map((c) => (c.key === key ? { ...c, discount: Math.max(0, discount) } : c)),
        })),
      updateCartItem: (key, patch) =>
        set((state) => ({
          cart: state.cart.map((c) => (c.key === key ? { ...c, ...patch } : c)),
        })),
      removeFromCart: (key) => set((state) => ({ cart: state.cart.filter((c) => c.key !== key) })),
      clearCart: () => set({ cart: [] }),
      setSettings: (settings) => set({ settings }),
    }),
    {
      name: "shifaa-pharmacy",
      partialize: (state) => ({ auth: state.auth, lang: state.lang, theme: state.theme, branchId: state.branchId }),
    }
  )
);

/** الصلاحيات لكل وحدة حسب الدور — RBAC */
export const PERMS: Record<string, SessionUser["role"][]> = {
  dashboard: ["ADMIN", "PHARMACIST", "CASHIER", "ACCOUNTANT", "INVENTORY_MANAGER"],
  pos: ["ADMIN", "PHARMACIST", "CASHIER"],
  products: ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER", "CASHIER"],
  labels: ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER"],
  inventory: ["ADMIN", "PHARMACIST", "INVENTORY_MANAGER"],
  prescriptions: ["ADMIN", "PHARMACIST", "CASHIER"],
  customers: ["ADMIN", "PHARMACIST", "CASHIER", "ACCOUNTANT"],
  suppliers: ["ADMIN", "INVENTORY_MANAGER", "ACCOUNTANT", "PHARMACIST"],
  finance: ["ADMIN", "ACCOUNTANT", "CASHIER"],
  hr: ["ADMIN", "ACCOUNTANT"],
  reports: ["ADMIN", "PHARMACIST", "ACCOUNTANT", "INVENTORY_MANAGER"],
  branches: ["ADMIN", "INVENTORY_MANAGER"],
  settings: ["ADMIN"],
};

export function canAccess(role: string, module: string): boolean {
  return PERMS[module]?.includes(role as any) ?? false;
}

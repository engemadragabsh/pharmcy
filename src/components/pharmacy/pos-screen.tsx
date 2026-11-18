"use client";

/**
 * نقطة البيع — بحث بالباركود/الاسم/المادة الفعالة، سلة، خصومات، خدمات،
 * طرق دفع متعددة، تعليق واسترجاع، مرتجعات، فحص تداخلات، طباعة
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, ConfirmDialog, paymentLabel } from "./shared";
import { api, ApiError } from "@/lib/client-api";
import { fmtMoney } from "@/lib/format";
import { InvoicePrintDialog, PrintInvoice } from "./invoice-print";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ScanBarcode, Plus, Minus, Trash2, ShoppingCart, PauseCircle, PlayCircle,
  Undo2, CreditCard, Banknote, Wallet, Landmark, HeartHandshake, Stethoscope,
  AlertTriangle, Search, CheckCircle2, HandCoins, UserRound, Barcode, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LookupItem {
  id: string;
  barcode: string;
  tradeName: string;
  tradeNameEn?: string;
  concentration?: string;
  packSize?: string;
  sellPrice: number;
  taxRate: number;
  requiresPrescription: boolean;
  activeIngredient?: string | null;
  availableQty: number;
}

interface ServiceItem {
  id: string;
  name: string;
  nameEn?: string;
  price: number;
}

interface CustomerLite {
  id: string;
  name: string;
  code: string;
  phone?: string;
  loyaltyPoints: number;
  allergies?: string | null;
}

interface HeldInvoice {
  id: string;
  no: string;
  customer?: { name: string } | null;
  total: number;
  heldAt: string;
  items: Array<{ productId?: string; name: string; qty: number; unitPrice: number; discount: number; taxRate: number }>;
}

interface PendingRx {
  id: string;
  no: string;
  customer?: { name: string } | null;
  doctor?: { name: string } | null;
  items: Array<{ productId?: string; productName: string; dosage?: string; qty: number; dispensedQty: number; product?: { tradeName: string } | null }>;
}

const PAYMENTS = [
  { key: "CASH", icon: Banknote },
  { key: "VISA", icon: CreditCard },
  { key: "WALLET", icon: Wallet },
  { key: "CREDIT", icon: HandCoins },
  { key: "INSURANCE", icon: Landmark },
] as const;

export default function POSScreen() {
  const { t, lang } = useI18n();
  const { cart, addToCart, updateCartQty, updateCartDiscount, removeFromCart, clearCart, branchId, branches, settings } = useApp();

  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [customer, setCustomer] = useState<CustomerLite | null>(null);

  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<"FIXED" | "PERCENT">("FIXED");
  const [couponCode, setCouponCode] = useState("");
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [redeemEnabled, setRedeemEnabled] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [paid, setPaid] = useState<number>(0);
  const [pendingRx, setPendingRx] = useState<PendingRx[]>([]);
  const [linkedRx, setLinkedRx] = useState<string>("");

  const [interactions, setInteractions] = useState<Array<{ severity: string; description: string; ingredients: string }>>([]);
  const [allergyWarnings, setAllergyWarnings] = useState<Array<{ ingredient: string; product: string }>>([]);
  const [rxWarning, setRxWarning] = useState<string[]>([]);
  const [checkoutConfirm, setCheckoutConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [held, setHeld] = useState<HeldInvoice[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [refundMode, setRefundMode] = useState(false);
  const [refundSearch, setRefundSearch] = useState("");
  const [refundInvoice, setRefundInvoice] = useState<(PrintInvoice & { id: string }) | null>(null);
  const [refundSelection, setRefundSelection] = useState<Record<number, number>>({});
  const [refundReason, setRefundReason] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);

  const [successInvoice, setSuccessInvoice] = useState<PrintInvoice | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const branchName = useMemo(() => {
    const b = branches.find((x) => x.id === branchId);
    return b ? (lang === "AR" ? b.name : b.nameEn) : "-";
  }, [branches, branchId, lang]);

  // ─── تحميل البيانات الأولية ───
  useEffect(() => {
    loadServices();
    loadCustomers();
    loadHeld();
    loadPendingRx();
    searchRef.current?.focus();
     
  }, []);

  const loadServices = async () => {
    try {
      const data = await api("/master-data");
      setServices(data.services || []);
    } catch {}
  };
  const loadCustomers = async () => {
    try {
      const data = await api("/customers?limit=100");
      setCustomers(data.items || []);
    } catch {}
  };
  const loadHeld = async () => {
    try {
      const data = await api("/invoices/hold");
      setHeld(data.items || []);
    } catch {}
  };
  const loadPendingRx = async () => {
    try {
      const data = await api("/prescriptions?status=PENDING");
      setPendingRx(data.items || []);
    } catch {}
  };

  // ─── البحث السريع ───
  const doSearch = async (q?: string) => {
    const term = q ?? query;
    if (!term.trim()) return;
    setSearching(true);
    try {
      const data = await api(`/products/lookup?q=${encodeURIComponent(term.trim())}&branchId=${branchId || ""}`);
      setResults(data.items || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    } finally {
      setSearching(false);
    }
  };

  // الباركود: Enter = مطابقة فورية وإضافة تلقائية من أول مسحة
  const handleSearchKey = async (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    try {
      const data = await api(`/products/lookup?q=${encodeURIComponent(term)}&branchId=${branchId || ""}`);
      const items: LookupItem[] = data.items || [];
      const exact = items.find((r) => r.barcode === term) || (items.length === 1 ? items[0] : null);
      if (exact) {
        handleAddToCart(exact);
        setQuery("");
        setResults([]);
      } else {
        setResults(items);
      }
    } catch {
      // تجاهل أخطاء البحث السريع
    } finally {
      setSearching(false);
    }
  };

  // ─── السلة ───
  const handleAddToCart = (item: LookupItem) => {
    if (item.availableQty <= 0) {
      toast.error(t("pos.outOfStock"));
      return;
    }
    addToCart({
      productId: item.id,
      name: lang === "AR" ? item.tradeName : item.tradeNameEn || item.tradeName,
      nameEn: item.tradeNameEn,
      qty: 1,
      unitPrice: item.sellPrice,
      taxRate: item.taxRate,
      availableQty: item.availableQty,
      requiresPrescription: item.requiresPrescription,
    });
    if (item.requiresPrescription) {
      toast.warning(`${item.tradeName}: ${t("pos.prescriptionRequired")}`, { duration: 3500 });
    }
    toast.success(`${lang === "AR" ? item.tradeName : item.tradeNameEn || item.tradeName} — ${t("pos.added")}`, { duration: 1500 });
    searchRef.current?.focus();
  };

  const addService = (s: ServiceItem) => {
    addToCart({
      productId: `SVC-${s.id}`,
      name: `${t("pos.services")}: ${lang === "AR" ? s.name : s.nameEn || s.name}`,
      qty: 1,
      unitPrice: s.price,
      taxRate: 14,
      availableQty: 9999,
    });
  };

  // حسابات
  const calc = useMemo(() => {
    let subtotal = 0;
    let itemDiscount = 0;
    let tax = 0;
    for (const it of cart) {
      const base = it.unitPrice * it.qty;
      const net = Math.max(0, base - it.discount);
      subtotal += base;
      itemDiscount += it.discount;
      tax += (net * it.taxRate) / 100;
    }
    let invDiscount = 0;
    if (discountType === "PERCENT") invDiscount = ((subtotal - itemDiscount) * (invoiceDiscount || 0)) / 100;
    else invDiscount = invoiceDiscount || 0;
    const redeemValue = redeemEnabled ? redeemPoints * (settings?.loyaltyRedeemRate || 0.25) : 0;
    invDiscount += redeemValue;
    const total = Math.max(0, subtotal - itemDiscount - invDiscount + tax);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      itemDiscount: Math.round(itemDiscount * 100) / 100,
      invDiscount: Math.round(invDiscount * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
      redeemValue: Math.round(redeemValue * 100) / 100,
      change: Math.max(0, Math.round((paid - total) * 100) / 100),
      earnPoints: settings?.loyaltyEnabled ? Math.floor(total / (settings?.loyaltyEarnRate || 50)) : 0,
    };
  }, [cart, invoiceDiscount, discountType, redeemEnabled, redeemPoints, paid, settings]);

  // فحص التداخلات تلقائياً
  useEffect(() => {
    const ids = cart.filter((c) => !c.productId.startsWith("SVC-")).map((c) => c.productId);
    if (!ids.length) {
      setInteractions([]);
      setAllergyWarnings([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api("/interactions/check", { method: "POST", body: { productIds: ids, customerId: customerId || null } });
        setInteractions(data.interactions || []);
        setAllergyWarnings(data.allergies || []);
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [cart, customerId]);

  // ─── إتمام البيع ───
  const doCheckout = async () => {
    if (!cart.length) return;
    setProcessing(true);
    try {
      const invoice = await api("/invoices", {
        method: "POST",
        body: {
          items: cart.map((c) => ({ productId: c.productId, qty: c.qty, discount: c.discount })),
          customerId: customerId || null,
          paymentMethod,
          invoiceDiscount,
          invoiceDiscountType: discountType,
          couponCode: couponCode || undefined,
          redeemPoints: redeemEnabled ? redeemPoints : 0,
          branchId,
          prescriptionId: linkedRx || undefined,
          paid: paid || calc.total,
        },
      });
      // جلب التفاصيل الكاملة للطباعة
      const detail = await api(`/invoices/${invoice.id}`);
      clearCart();
      resetSale();
      setSuccessInvoice(detail);
      setPrintOpen(true);
      loadHeld();
      loadPendingRx();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"), { duration: 4000 });
    } finally {
      setProcessing(false);
      setCheckoutConfirm(false);
    }
  };

  const resetSale = () => {
    setInvoiceDiscount(0);
    setCouponCode("");
    setRedeemPoints(0);
    setRedeemEnabled(false);
    setPaymentMethod("CASH");
    setPaid(0);
    setCustomerId("");
    setCustomer(null);
    setLinkedRx("");
    setRefundMode(false);
    setRefundInvoice(null);
    setRefundSearch("");
    setQuery("");
    setResults([]);
    setInteractions([]);
    setAllergyWarnings([]);
    setRxWarning([]);
  };

  // ─── تعليق السلة ───
  const doHold = async () => {
    if (!cart.length) return;
    try {
      await api("/invoices/hold", {
        method: "POST",
        body: {
          items: cart.map((c) => ({ productId: c.productId, name: c.name, qty: c.qty, unitPrice: c.unitPrice, discount: c.discount, taxRate: c.taxRate })),
          customerId: customerId || null,
          branchId,
          invoiceDiscount,
        },
      });
      clearCart();
      resetSale();
      setShowHeld(true);
      loadHeld();
      toast.success(t("pos.hold") + " ✓");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
  };

  const resumeHeld = async (h: HeldInvoice) => {
    for (const it of h.items) {
      if (!it.productId || it.productId.startsWith("SVC-")) continue;
      const lookup = await api(`/products/lookup?q=${it.productId}&branchId=${branchId || ""}`);
      const found = (lookup.items || [])[0];
      if (found) {
        addToCart({
          productId: found.id,
          name: lang === "AR" ? found.tradeName : found.tradeNameEn || found.tradeName,
          qty: it.qty,
          unitPrice: it.unitPrice,
          taxRate: it.taxRate,
          availableQty: found.availableQty + it.qty,
        });
      }
    }
    if (h.customer) {
      // العميل موجود باسمه في الفاتورة المعلقة
      try {
        const custs = await api(`/customers?q=${encodeURIComponent(h.customer.name)}`);
        if (custs.items?.length) {
          setCustomerId(custs.items[0].id);
          setCustomer(custs.items[0]);
        }
      } catch {}
    }
    await api(`/invoices/hold?id=${h.id}`, { method: "DELETE" });
    setShowHeld(false);
    loadHeld();
    toast.success(t("pos.resume") + " ✓");
  };

  const deleteHeld = async (h: HeldInvoice) => {
    await api(`/invoices/hold?id=${h.id}`, { method: "DELETE" });
    loadHeld();
  };

  // ─── المرتجعات ───
  const searchRefundInvoice = async () => {
    if (!refundSearch.trim()) return;
    setRefundLoading(true);
    try {
      const list = await api(`/invoices?q=${encodeURIComponent(refundSearch.trim())}&type=SALE`);
      const found = (list.items || []).find((i: any) => i.no === refundSearch.trim().toUpperCase());
      if (!found) {
        toast.error(lang === "AR" ? "لم يتم العثور على فاتورة بهذا الرقم" : "Invoice not found");
        return;
      }
      const detail = await api(`/invoices/${found.id}`);
      if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(detail.status)) {
        toast.error(lang === "AR" ? "الفاتورة غير قابلة للإرجاع" : "Invoice cannot be refunded");
        return;
      }
      setRefundInvoice({ ...detail, id: detail.id });
      setRefundSelection({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    } finally {
      setRefundLoading(false);
    }
  };

  const doRefund = async () => {
    if (!refundInvoice) return;
    const refundItems = Object.entries(refundSelection)
      .map(([idx, qty]) => ({ invoiceItemId: (refundInvoice.items[Number(idx)] as any)?.id, qty }))
      .filter((x) => x.invoiceItemId && x.qty > 0);
    if (!refundItems.length) {
      toast.error(t("pos.selectToRefund"));
      return;
    }
    try {
      await api(`/invoices/${refundInvoice.id}/refund`, { method: "POST", body: { items: refundItems, reason: refundReason } });
      toast.success(t("app.success") + " ✓");
      setRefundInvoice(null);
      setRefundSearch("");
      setRefundReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"), { duration: 4000 });
    }
  };

  const fmtM = (n: number) => fmtMoney(n, lang);
  const fmtQty = (n: number) => n.toLocaleString(lang === "AR" ? "ar-EG" : "en-US");

  return (
    <div>
      <PageHeader
        icon={ScanBarcode}
        title={t("pos.title")}
        subtitle={`${branchName} • ${fmtQty(new Date().getDate())}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setShowHeld(true)} className="gap-2">
              <PauseCircle className="h-4 w-4" /> {t("pos.heldList")}
              {held.length > 0 && <Badge className="bg-amber-500 text-white">{fmtQty(held.length)}</Badge>}
            </Button>
            <Button variant={refundMode ? "default" : "outline"} onClick={() => setRefundMode(!refundMode)} className={cn("gap-2", refundMode && "bg-red-600 hover:bg-red-700")}>
              <Undo2 className="h-4 w-4" /> {t("pos.refund")}
            </Button>
          </>
        }
      />

      {/* تنبيهات التداخلات والحساسية */}
      {(allergyWarnings.length > 0 || interactions.length > 0 || rxWarning.length > 0) && !refundMode && (
        <div className="mb-4 space-y-2">
          {allergyWarnings.map((a, i) => (
            <div key={`al-${i}`} className="flex items-start gap-2 p-3 rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/40 text-sm">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-700 dark:text-red-400">{t("pos.allergyAlert")} — {a.ingredient}</p>
                <p className="text-red-600 dark:text-red-300">{a.product}: {lang === "AR" ? "العميل لديه حساسية من هذه المادة الفعالة" : "Customer is allergic to this active ingredient"}</p>
              </div>
            </div>
          ))}
          {interactions.map((x, i) => (
            <div key={`in-${i}`} className={cn("flex items-start gap-2 p-3 rounded-lg border text-sm", x.severity === "MAJOR" ? "border-red-500 bg-red-50 dark:bg-red-950/40" : "border-amber-500 bg-amber-50 dark:bg-amber-950/40")}>
              <AlertTriangle className={cn("h-5 w-5 shrink-0 mt-0.5", x.severity === "MAJOR" ? "text-red-600" : "text-amber-600")} />
              <div>
                <p className={cn("font-bold", x.severity === "MAJOR" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>
                  {t("pos.interactions")} — {x.ingredients}
                </p>
                <p className={cn(x.severity === "MAJOR" ? "text-red-600 dark:text-red-300" : "text-amber-600 dark:text-amber-300")}>{x.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {refundMode ? (
        /* ══════════ وضع المرتجعات ══════════ */
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-600">
              <Undo2 className="h-5 w-5" /> {t("pos.refundMode")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                dir="ltr"
                placeholder="INV-00001"
                value={refundSearch}
                onChange={(e) => setRefundSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchRefundInvoice()}
                className="font-mono"
              />
              <Button onClick={searchRefundInvoice} disabled={refundLoading} className="gap-2 shrink-0">
                <Search className="h-4 w-4" /> {refundLoading ? t("app.loading") : t("app.search")}
              </Button>
            </div>

            {refundInvoice && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-semibold font-mono" dir="ltr">{refundInvoice.no}</span>
                  <span>{fmtDate(refundInvoice.createdAt)}</span>
                  <Badge variant="outline">{t("pos.originalInvoice")}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => setRefundInvoice(null)}><X className="h-4 w-4" /></Button>
                </div>
                <Separator />
                <p className="text-sm text-muted-foreground">{t("pos.selectToRefund")}</p>
                <div className="space-y-2">
                  {refundInvoice.items.map((it, i) => {
                    const refundable = (it as any).qty - ((it as any).refundedQty || 0);
                    return (
                      <div key={i} className={cn("flex items-center justify-between gap-3 p-2.5 rounded border text-sm", refundable <= 0 && "opacity-50")}>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{it.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("print.price")}: {fmtM(it.unitPrice)} • {t("pos.refundable")}: {fmtQty(Math.max(0, refundable))}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Input
                            type="number"
                            min={0}
                            max={Math.max(0, refundable)}
                            disabled={refundable <= 0}
                            value={refundSelection[i] ?? 0}
                            onChange={(e) => setRefundSelection({ ...refundSelection, [i]: Math.min(Math.max(0, Number(e.target.value)), Math.max(0, refundable)) })}
                            className="w-20 h-9 text-center"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <Label>{t("pos.reason")}</Label>
                  <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder={lang === "AR" ? "مثال: خطأ في الصرف / انتهاء" : "e.g. dispensing error"} className="mt-1" />
                </div>
                <Button className="w-full bg-red-600 hover:bg-red-700 gap-2" onClick={doRefund}>
                  <Undo2 className="h-4 w-4" /> {t("pos.confirmRefund")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* ══════════ وضع البيع ══════════ */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* البحث */}
          <Card className="lg:col-span-5 xl:col-span-4 flex flex-col">
            <CardContent className="p-4 flex flex-col gap-3 flex-1">
              <div className="relative">
                <ScanBarcode className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKey}
                  placeholder={t("pos.searchPlaceholder")}
                  className="ps-11 h-12 text-base"
                  autoFocus
                />
                {query && (
                  <button className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => { setQuery(""); setResults([]); }}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <ScrollArea className="flex-1 min-h-[280px] max-h-[420px]">
                {results.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-10 flex flex-col items-center gap-2">
                    <Barcode className="h-10 w-10 text-muted-foreground/40" />
                    {query ? (searching ? t("app.loading") : t("app.noData")) : (lang === "AR" ? "امسح الباركود أو اكتب للبحث" : "Scan or type to search")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        className="w-full text-start p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                        onClick={() => handleAddToCart(r)}
                        disabled={r.availableQty <= 0}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{lang === "AR" ? r.tradeName : r.tradeNameEn || r.tradeName}</p>
                            <p className="text-xs text-muted-foreground truncate">{r.concentration || ""} {r.activeIngredient ? `• ${r.activeIngredient}` : ""}</p>
                            <p className="text-xs font-mono text-muted-foreground" dir="ltr">{r.barcode}</p>
                          </div>
                          <div className="text-end shrink-0">
                            <p className="font-bold text-primary text-sm">{fmtM(r.sellPrice)}</p>
                            <Badge variant={r.availableQty > 0 ? "secondary" : "destructive"} className="mt-1">
                              {r.availableQty > 0 ? `${t("pos.available")}: ${fmtQty(r.availableQty)}` : t("pos.outOfStock")}
                            </Badge>
                          </div>
                        </div>
                        {r.requiresPrescription && (
                          <Badge className="mt-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0">{t("pos.rx")}</Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <Button variant="outline" onClick={() => doSearch()} className="gap-2" disabled={!query.trim()}>
                <Search className="h-4 w-4" /> {t("app.search")}
              </Button>
            </CardContent>
          </Card>

          {/* السلة */}
          <Card className="lg:col-span-7 xl:col-span-5 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                {t("pos.cart")}
                {cart.length > 0 && <Badge variant="secondary">{fmtQty(cart.length)}</Badge>}
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" className="ms-auto text-destructive" onClick={() => { clearCart(); resetSale(); }}>
                    <Trash2 className="h-4 w-4" /> {t("pos.clearCart")}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex-1 flex flex-col">
              {cart.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-10 text-center gap-3">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShoppingCart className="h-8 w-8 text-primary/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t("pos.cartEmpty")}</p>
                </div>
              ) : (
                <ScrollArea className="flex-1 max-h-[420px] min-h-[280px]">
                  <div className="space-y-2">
                    {cart.map((c) => (
                      <div key={c.key} className="flex items-center gap-2 p-2.5 rounded-lg border bg-card">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{fmtM(c.unitPrice)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQty(c.key, c.qty - 1)} aria-label="minus"><Minus className="h-3 w-3" /></Button>
                          <Input
                            type="number"
                            value={c.qty}
                            onChange={(e) => updateCartQty(c.key, Number(e.target.value))}
                            className="w-14 h-7 text-center text-sm"
                          />
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartQty(c.key, c.qty + 1)} aria-label="plus"><Plus className="h-3 w-3" /></Button>
                        </div>
                        <div className="w-24 shrink-0">
                          <Input
                            type="number"
                            min={0}
                            value={c.discount || ""}
                            placeholder={t("pos.discount")}
                            onChange={(e) => updateCartDiscount(c.key, Number(e.target.value) || 0)}
                            className="w-full h-7 text-xs text-center"
                          />
                        </div>
                        <p className="text-sm font-bold w-24 text-end shrink-0">{fmtM(c.unitPrice * c.qty - c.discount)}</p>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => removeFromCart(c.key)} aria-label="remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* الإجمالي والدفع */}
          <Card className="lg:col-span-12 xl:col-span-3">
            <CardContent className="p-4 space-y-3">
              {/* العميل */}
              <div>
                <Label className="text-xs">{t("pos.customer")}</Label>
                <Select
                  value={customerId || "walkin"}
                  onValueChange={(v) => {
                    setCustomerId(v === "walkin" ? "" : v);
                    setCustomer(v === "walkin" ? null : customers.find((c) => c.id === v) || null);
                    setRedeemPoints(0);
                    setRedeemEnabled(false);
                  }}
                >
                  <SelectTrigger className="mt-1 h-10">
                    <SelectValue placeholder={t("pos.walkIn")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="walkin">{t("pos.walkIn")}</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customer && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge variant="secondary" className="text-xs">{t("pos.loyalty")}: {fmtQty(customer.loyaltyPoints)} {t("pos.earn")}</Badge>
                    {customer.allergies && (
                      <Badge variant="destructive" className="text-xs">{t("cust.allergies")}: {customer.allergies}</Badge>
                    )}
                  </div>
                )}
              </div>

              {/* ربط وصفة */}
              {pendingRx.length > 0 && (
                <div>
                  <Label className="text-xs">{t("pos.linkPrescription")}</Label>
                  <Select value={linkedRx} onValueChange={setLinkedRx}>
                    <SelectTrigger className="mt-1 h-10"><SelectValue placeholder={lang === "AR" ? "بدون وصفة" : "No prescription"} /></SelectTrigger>
                    <SelectContent className="max-h-40">
                      <SelectItem value="none">{lang === "AR" ? "بدون وصفة" : "No prescription"}</SelectItem>
                      {pendingRx.map((rx) => (
                        <SelectItem key={rx.id} value={rx.id}>
                          {rx.no} — {rx.customer?.name} ({rx.doctor?.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* الخصومات */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{t("pos.invoiceDiscount")}</Label>
                  <Input type="number" min={0} value={invoiceDiscount || ""} onChange={(e) => setInvoiceDiscount(Number(e.target.value) || 0)} className="mt-1 h-10" />
                </div>
                <div>
                  <Label className="text-xs">{t("app.type")}</Label>
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as "FIXED" | "PERCENT")}>
                    <SelectTrigger className="mt-1 h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">{t("pos.fixed")}</SelectItem>
                      <SelectItem value="PERCENT">{t("pos.percent")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">{t("pos.coupon")}</Label>
                <Input dir="ltr" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="WELCOME10 / PHARMA25" className="mt-1 h-10 font-mono" />
              </div>

              {/* نقاط الولاء */}
              {settings?.loyaltyEnabled && customer && customer.loyaltyPoints > 0 && (
                <div className="flex items-center justify-between rounded-lg border p-2.5">
                  <div className="text-xs">
                    <p className="font-medium">{t("pos.redeemPoints")}</p>
                    <p className="text-muted-foreground">{fmtQty(customer.loyaltyPoints)} {t("pos.earn")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {redeemEnabled && (
                      <Input
                        type="number"
                        min={0}
                        max={customer.loyaltyPoints}
                        value={redeemPoints}
                        onChange={(e) => setRedeemPoints(Math.min(Number(e.target.value) || 0, customer.loyaltyPoints))}
                        className="w-20 h-8 text-center"
                      />
                    )}
                    <Switch checked={redeemEnabled} onCheckedChange={setRedeemEnabled} aria-label="redeem" />
                  </div>
                </div>
              )}

              {/* الخدمات */}
              <div>
                <Label className="text-xs flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" /> {t("pos.addService")}</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {services.map((s) => (
                    <button key={s.id} onClick={() => addService(s)}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors">
                        {lang === "AR" ? s.name : s.nameEn || s.name} · {s.price}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* الحساب */}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("pos.subtotal")}</span><span>{fmtM(calc.subtotal)}</span></div>
                {calc.itemDiscount > 0 && <div className="flex justify-between text-red-500"><span>{t("pos.discount")} ({t("print.item")})</span><span>-{fmtM(calc.itemDiscount)}</span></div>}
                {calc.invDiscount > 0 && <div className="flex justify-between text-red-500"><span>{t("pos.discount")} ({t("pos.invoiceDiscount")})</span><span>-{fmtM(calc.invDiscount)}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">{t("pos.tax")}</span><span>{fmtM(calc.tax)}</span></div>
                <div className="flex justify-between text-lg font-bold border-t pt-2"><span>{t("pos.grandTotal")}</span><span className="text-primary">{fmtM(calc.total)}</span></div>
                {calc.earnPoints > 0 && <p className="text-xs text-emerald-600">+{fmtQty(calc.earnPoints)} {t("pos.earn")}</p>}
              </div>

              {/* الدفع */}
              <div>
                <Label className="text-xs">{t("pos.payment")}</Label>
                <div className="grid grid-cols-5 gap-1 mt-1.5">
                  {PAYMENTS.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.key}
                        onClick={() => setPaymentMethod(p.key)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors text-[10px] leading-none",
                          paymentMethod === p.key ? "border-primary bg-primary/10 text-primary font-bold" : "border-border hover:border-primary/50"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {t(`pos.pay.${p.key.toLowerCase()}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">{t("pos.paid")}</Label>
                  <Input type="number" min={0} value={paid || ""} onChange={(e) => setPaid(Number(e.target.value) || 0)} placeholder={String(calc.total)} className="mt-1 h-10" />
                </div>
                <div>
                  <Label className="text-xs">{t("pos.change")}</Label>
                  <div className="mt-1 h-10 rounded-md border flex items-center px-3 font-bold text-emerald-600 bg-emerald-500/5">
                    {fmtM(paid > 0 ? calc.change : 0)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <Button variant="outline" className="gap-1.5" onClick={doHold} disabled={!cart.length}>
                  <PauseCircle className="h-4 w-4" /> {t("pos.hold")}
                </Button>
                <Button
                  className="col-span-2 gap-2"
                  onClick={() => {
                    if (!cart.length) return;
                    if (allergyWarnings.some((a) => cart.some((c) => (lang === "AR" ? c.name : c.nameEn || c.name) === a.product))) {
                      setCheckoutConfirm(true);
                      return;
                    }
                    setCheckoutConfirm(true);
                  }}
                  disabled={!cart.length || processing}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {processing ? t("app.loading") : `${t("pos.checkout")} • ${fmtM(calc.total)}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* تأكيد البيع مع تحذير الحساسية */}
      <ConfirmDialog
        open={checkoutConfirm}
        onOpenChange={setCheckoutConfirm}
        title={allergyWarnings.length > 0 ? `${t("pos.allergyAlert")} ${t("app.confirm")}` : t("pos.checkout")}
        message={
          allergyWarnings.length > 0
            ? `${lang === "AR" ? "تحذير حساسية:" : "Allergy warning:"} ${allergyWarnings.map((a) => a.product).join(", ")} — ${lang === "AR" ? "هل تريد المتابعة؟" : "Continue anyway?"}`
            : `${t("pos.grandTotal")}: ${fmtM(calc.total)} • ${paymentLabel(paymentMethod, t)}`
        }
        onConfirm={doCheckout}
        destructive={allergyWarnings.length > 0}
      />

      {/* الفواتير المعلقة */}
      <Dialog open={showHeld} onOpenChange={setShowHeld}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-amber-500" /> {t("pos.heldList")}
            </DialogTitle>
          </DialogHeader>
          {held.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("app.noData")}</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {held.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold" dir="ltr">{h.no}</p>
                    <p className="text-xs text-muted-foreground truncate">{h.customer?.name || t("pos.walkIn")} • {fmtM(h.total)}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(h.heldAt || Date.now()).toLocaleTimeString(lang === "AR" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => resumeHeld(h)}>
                      <PlayCircle className="h-4 w-4" /> {t("pos.resume")}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteHeld(h)}><X className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* نافذة الطباعة */}
      <InvoicePrintDialog open={printOpen} onOpenChange={setPrintOpen} invoice={successInvoice} />
    </div>
  );
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

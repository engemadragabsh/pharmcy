"use client";

/**
 * ملصقات الباركود — طباعة ملصق قياسي 38×25 مم
 * المحتوى: اسم الصيدلية + اسم الدواء + تاريخ الانتهاء + السعر + باركود CODE128/EAN13
 * نمطا الطباعة: طابعة ملصقات (ملصق لكل صفحة) أو ورقة A4 ملصقات (55 ملصقاً)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";
import { useApp } from "@/lib/store";
import { useI18n, PageHeader, EmptyState } from "./shared";
import { api } from "@/lib/client-api";
import { fmtMoney, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label as UILabel } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Barcode, Plus, Minus, X, Search, Printer, RefreshCw, PackagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface LabelProduct {
  id: string;
  barcode: string;
  tradeName: string;
  tradeNameEn?: string | null;
  sellPrice: number;
  taxRate: number;
  stock: number;
  earliestExpiry: string | null;
  batches?: Array<{ expiryDate: string; quantity: number; branchId: string }>;
}

/** عنصر مُختار للطباعة */
interface LabelItem {
  productId: string;
  barcode: string;
  name: string;
  nameEn?: string | null;
  price: number;
  taxRate: number;
  expiry: string; // ISO yyyy-mm-dd أو ""
  qty: number; // عدد الملصقات
}

interface LabelOptions {
  pharmacyName: string;
  showPharmacy: boolean;
  showExpiry: boolean;
  showPrice: boolean;
  priceWithTax: boolean;
  mode: "LABEL" | "A4";
}

const MAX_PER_PRODUCT = 100;

/** تحويل ISO إلى MM/YYYY للعرض على الملصق */
function expiryShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${m}/${d.getFullYear()}`;
}

/** باركود متجهي — CODE128 (يوافق EAN13 تلقائياً للأرقام القياسية) */
function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        width: 1,
        height: 18,
        displayValue: false,
        margin: 0,
        lineColor: "#000000",
        background: "transparent",
      });
    } catch {
      /* قيمة غير قابلة للترميز — تُترك فارغة */
    }
  }, [value]);
  return <svg ref={ref} style={{ height: "4.2mm", maxWidth: "34mm" }} className="block" />;
}

/** ملصق واحد 38×25 مم — الحجم الحقيقي بالملليمتر */
function BarcodeLabel({ item, opts, lang }: { item: LabelItem; opts: LabelOptions; lang: "AR" | "EN" }) {
  const finalPrice = opts.priceWithTax ? item.price * (1 + (item.taxRate || 0) / 100) : item.price;
  const rowSingle = (opts.showExpiry && !!item.expiry) !== opts.showPrice; // عنصر واحد فقط في السطر
  return (
    <div
      className="label-38x25 flex flex-col items-center justify-between bg-white text-black overflow-hidden"
      dir={lang === "AR" ? "rtl" : "ltr"}
      data-testid="barcode-label"
    >
      {opts.showPharmacy && <div className="l-ph w-full">{opts.pharmacyName}</div>}
      <div className="l-name w-full">{lang === "AR" ? item.name : item.nameEn || item.name}</div>
      <div className={cn("l-row flex w-full items-center px-[1mm]", rowSingle ? "justify-center" : "justify-between")}>
        {opts.showExpiry && item.expiry && (
          <span className="l-exp">
            {lang === "AR" ? "انتهاء" : "EXP"}: {expiryShort(item.expiry)}
          </span>
        )}
        {opts.showPrice && (
          <span className="l-price" dir="ltr">
            {finalPrice.toFixed(2)} {lang === "AR" ? "ج.م" : "EGP"}
          </span>
        )}
      </div>
      <BarcodeSvg value={item.barcode} />
      <div className="l-code" dir="ltr">{item.barcode}</div>
    </div>
  );
}

export default function LabelsScreen() {
  const { t, lang } = useI18n();
  const branchId = useApp((s) => s.branchId);
  const settings = useApp((s) => s.settings);

  // قائمة المنتجات للبحث
  const [products, setProducts] = useState<LabelProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  // الملصقات المحددة والخيارات
  const [items, setItems] = useState<LabelItem[]>([]);
  const [opts, setOpts] = useState<LabelOptions>({
    pharmacyName: "",
    showPharmacy: true,
    showExpiry: true,
    showPrice: true,
    priceWithTax: true,
    mode: "LABEL",
  });
  const [nameTouched, setNameTouched] = useState(false);

  const fmtM = (n: number) => fmtMoney(n, lang);

  // اسم الصيدلية الافتراضي من الإعدادات
  useEffect(() => {
    if (nameTouched || !settings) return;
    const def = lang === "AR" ? settings.pharmacyName || t("app.name") : settings.pharmacyNameEn || settings.pharmacyName || t("app.name");
    setOpts((o) => ({ ...o, pharmacyName: def }));
  }, [settings, lang, nameTouched]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "10", includeBatches: "1", active: "true" });
      if (q) params.set("q", q);
      const data = await api(`/products?${params}`);
      setProducts(
        (data.items || []).map((p: any) => {
          // أقرب صلاحية صالحة في الفرع الحالي (أو كل الفروع)
          const valid = (p.batches || [])
            .filter((b: any) => new Date(b.expiryDate) > new Date() && (!branchId || b.branchId === branchId))
            .sort((a: any, b: any) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
          return { ...p, earliestExpiry: valid[0]?.expiryDate ?? null };
        })
      );
      setTotal(data.total || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("app.error"));
    }
    setLoading(false);
  }, [page, q, branchId]);

  useEffect(() => { load(); }, [load]);

  /** إضافة صنف للطباعة */
  const addItem = (p: LabelProduct) => {
    if (items.some((i) => i.productId === p.id)) {
      toast.info(t("lbl.alreadyAdded"));
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        barcode: p.barcode,
        name: p.tradeName,
        nameEn: p.tradeNameEn || null,
        price: p.sellPrice,
        taxRate: p.taxRate,
        expiry: p.earliestExpiry ? String(p.earliestExpiry).slice(0, 10) : "",
        qty: 1,
      },
    ]);
    toast.success(t("lbl.addedDone"));
  };

  const updateItem = (productId: string, patch: Partial<LabelItem>) =>
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));

  const removeItem = (productId: string) => setItems((prev) => prev.filter((i) => i.productId !== productId));

  const totalPages = Math.max(1, Math.ceil(total / 10));

  /** قائمة الملصقات الكاملة — المنتج الواحد يكرر بعدد الملصقات */
  const allLabels = useMemo(() => items.flatMap((i) => Array.from({ length: i.qty }, () => i)), [items]);
  const totalLabels = allLabels.length;
  const previewLabels = useMemo(() => allLabels.slice(0, 200), [allLabels]);

  // وسم body عند وجود ملصقات — لإخفاء باقي الصفحة أثناء الطباعة (بديل متوافق لـ :has)
  useEffect(() => {
    if (totalLabels > 0) document.body.classList.add("has-labels-print");
    else document.body.classList.remove("has-labels-print");
    return () => document.body.classList.remove("has-labels-print");
  }, [totalLabels]);

  /** الطباعة — حقن @page المناسب ثم استدعاء الطباعة */
  const doPrint = () => {
    if (totalLabels === 0) return;
    const old = document.getElementById("dynamic-page-style");
    old?.remove();
    const st = document.createElement("style");
    st.id = "dynamic-page-style";
    st.textContent =
      opts.mode === "LABEL"
        ? "@page { size: 38mm 25mm; margin: 0; }"
        : "@page { size: A4 portrait; margin: 4mm; }";
    document.head.appendChild(st);
    const prevTitle = document.title;
    document.title = lang === "AR" ? "ملصقات الباركود 38×25" : "Barcode Labels 38x25";
    const cleanup = () => {
      st.remove();
      document.title = prevTitle;
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 2000);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Barcode}
        title={t("lbl.title")}
        subtitle={t("lbl.subtitle")}
        actions={
          <Button onClick={doPrint} disabled={totalLabels === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Printer className="h-4 w-4 me-2" />
            {t("lbl.print")} ({fmtNum(totalLabels, lang)})
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* اختيار الأصناف */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              {t("lbl.selectProducts")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder={t("app.search")}
                className="ps-8"
              />
            </div>

            <ScrollArea className="h-64 rounded-md border">
              <div className="p-2 space-y-1.5">
                {loading ? (
                  <div className="flex justify-center py-8"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : products.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">{t("app.noData")}</p>
                ) : (
                  products.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/60 border border-transparent hover:border-border">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">
                          {lang === "AR" ? p.tradeName : p.tradeNameEn || p.tradeName}
                        </p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5" dir="ltr">
                          <span>{p.barcode}</span>
                          <span>•</span>
                          <span>{fmtM(p.sellPrice)}</span>
                          {p.earliestExpiry && (
                            <>
                              <span>•</span>
                              <span className="text-amber-600 dark:text-amber-400" dir="ltr">{expiryShort(String(p.earliestExpiry).slice(0, 10))}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => addItem(p)} aria-label={t("lbl.addToLabels")}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* ترقيم الصفحات */}
            <div className="flex items-center justify-between text-xs">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                −
              </Button>
              <span className="text-muted-foreground">{fmtNum(page, lang)} / {fmtNum(totalPages, lang)}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                +
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* المحدد + الخيارات */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-primary" />
              {t("lbl.selected")}
              <span className="ms-auto text-xs font-normal text-muted-foreground">
                {t("lbl.totalLabels")}: <strong className="text-foreground">{fmtNum(totalLabels, lang)}</strong>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* جدول المحدد */}
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{t("lbl.noSelection")}</p>
            ) : (
              <div className="space-y-2">
                {items.map((i) => (
                  <div key={i.productId} className="flex flex-wrap items-center gap-2 p-2 rounded-lg border bg-muted/30">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="text-xs font-semibold truncate">{lang === "AR" ? i.name : i.nameEn || i.name}</p>
                      <p className="text-[10px] text-muted-foreground" dir="ltr">{i.barcode}</p>
                    </div>
                    {/* تاريخ الانتهاء */}
                    <div className="space-y-0.5">
                      <UILabel className="text-[9px] text-muted-foreground">{t("lbl.expiry")}</UILabel>
                      <Input
                        type="date"
                        value={i.expiry}
                        onChange={(e) => updateItem(i.productId, { expiry: e.target.value })}
                        className="h-7 text-xs w-32"
                      />
                    </div>
                    {/* عدد الملصقات */}
                    <div className="space-y-0.5">
                      <UILabel className="text-[9px] text-muted-foreground">{t("lbl.labelsQty")}</UILabel>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-7 w-7" disabled={i.qty <= 1}
                          onClick={() => updateItem(i.productId, { qty: Math.max(1, i.qty - 1) })}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_PER_PRODUCT}
                          value={i.qty}
                          onChange={(e) => updateItem(i.productId, { qty: Math.min(MAX_PER_PRODUCT, Math.max(1, parseInt(e.target.value) || 1)) })}
                          className="h-7 w-14 text-center text-xs"
                        />
                        <Button variant="outline" size="icon" className="h-7 w-7" disabled={i.qty >= MAX_PER_PRODUCT}
                          onClick={() => updateItem(i.productId, { qty: Math.min(MAX_PER_PRODUCT, i.qty + 1) })}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive ms-auto"
                      onClick={() => removeItem(i.productId)} aria-label={t("app.delete")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* خيارات الملصق */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <UILabel className="text-xs">{t("lbl.pharmacyName")}</UILabel>
                <Input
                  value={opts.pharmacyName}
                  onChange={(e) => { setNameTouched(true); setOpts((o) => ({ ...o, pharmacyName: e.target.value })); }}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <UILabel className="text-xs">{t("lbl.printMode")}</UILabel>
                <Select value={opts.mode} onValueChange={(v) => setOpts((o) => ({ ...o, mode: v as LabelOptions["mode"] }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LABEL">{t("lbl.modeLabel")}</SelectItem>
                    <SelectItem value="A4">{t("lbl.modeA4")}</SelectItem>
                  </SelectContent>
                </Select>
                {opts.mode === "A4" && <p className="text-[10px] text-muted-foreground">{t("lbl.perA4")}</p>}
              </div>
            </div>

            {/* مفاتيح العرض */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {([
                ["showPharmacy", t("lbl.showPharmacy")],
                ["showExpiry", t("lbl.showExpiry")],
                ["showPrice", t("lbl.showPrice")],
                ["priceWithTax", t("lbl.priceWithTax")],
              ] as Array<[keyof LabelOptions, string]>).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2 p-2 rounded-md border">
                  <Checkbox
                    id={`opt-${key}`}
                    checked={opts[key] as boolean}
                    onCheckedChange={(v) => setOpts((o) => ({ ...o, [key]: !!v }))}
                  />
                  <UILabel htmlFor={`opt-${key}`} className="text-[11px] cursor-pointer leading-tight">{label}</UILabel>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* المعاينة الحقيقية + منطقة الطباعة */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Barcode className="h-4 w-4 text-primary" />
            {t("lbl.preview")}
            <span className="ms-auto text-xs font-normal text-muted-foreground">
              {opts.mode === "LABEL" ? "38×25 mm" : t("lbl.perA4")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalLabels === 0 ? (
            <EmptyState icon={Barcode} message={t("lbl.noSelection")} />
          ) : (
            <>
              {/* معاينة على الشاشة — أول 200 ملصق */}
              <ScrollArea className="w-full rounded-md border bg-neutral-100 dark:bg-neutral-900 h-[200px]">
                <div className="flex flex-wrap gap-2 p-3 justify-center">
                  {previewLabels.map((item, idx) => (
                    <BarcodeLabel key={`pv-${item.productId}-${idx}`} item={item} opts={opts} lang={lang} />
                  ))}
                </div>
              </ScrollArea>
              {totalLabels > 200 && (
                <p className="text-[10px] text-muted-foreground text-center mt-2">{t("lbl.previewCapped")}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* منطقة الطباعة الفعلية — Portal مباشر في body: تُطبع وحدها بلا صفحات فارغة */}
      {typeof document !== "undefined" && totalLabels > 0 &&
        createPortal(
          <div className={cn("print-area print-labels labels-print-root", opts.mode === "LABEL" ? "labels-strip" : "labels-sheet")}>
            {allLabels.map((item, idx) => (
              <BarcodeLabel key={`pr-${item.productId}-${idx}`} item={item} opts={opts} lang={lang} />
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

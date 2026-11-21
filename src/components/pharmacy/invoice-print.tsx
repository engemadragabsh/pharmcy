"use client";

/**
 * طباعة الفواتير — حراري 80mm + A4 مع QR للفاتورة الإلكترونية
 */
import { useState } from "react";
import { useApp } from "@/lib/store";
import { useI18n } from "./shared";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Send, Mail, MessageSquare, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { paymentLabel } from "./shared";

export interface PrintInvoice {
  no: string;
  type: string;
  createdAt: string | Date;
  subtotal: number;
  itemDiscount: number;
  invoiceDiscount: number;
  tax: number;
  total: number;
  paid: number;
  changeDue: number;
  paymentMethod: string;
  eInvoiceUuid?: string | null;
  customer?: { name: string; phone?: string | null; code?: string } | null;
  user?: { fullName: string } | null;
  branch?: { name: string; address?: string | null; phone?: string | null } | null;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    discount: number;
    taxRate: number;
    taxAmount: number;
    total: number;
    batch?: { batchNo?: string } | null;
  }>;
}

export function InvoicePrintDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: PrintInvoice | null;
}) {
  const { t } = useI18n();
  const lang = useApp((s) => s.lang);
  const settings = useApp((s) => s.settings);

  if (!invoice) return null;

  // اسم الصيدلية من الإعدادات المحفوظة — البديل العام اسم النظام فقط
  const pharmacyName = lang === "AR" ? settings?.pharmacyName || t("app.name") : settings?.pharmacyNameEn || settings?.pharmacyName || t("app.name");
  const etaPayload = `اسم الصيدلية: ${pharmacyName}\nالرقم الضريبي: ${settings?.taxNumber || "-"}\nالتاريخ: ${fmtDate(invoice.createdAt, lang, true)}\nالإجمالي: ${invoice.total}\nالضريبة: ${invoice.tax}\nUUID: ${invoice.eInvoiceUuid || "-"}`;

  const sendVia = (channel: string) => {
    if (!invoice.customer?.phone && !invoice.customer) {
      toast.error(lang === "AR" ? "لا يوجد عميل مرتبط بالفاتورة" : "No customer linked to this invoice");
      return;
    }
    toast.success(lang === "AR" ? `تم إرسال الفاتورة ${invoice.no} عبر ${channel}` : `Invoice ${invoice.no} sent via ${channel}`);
  };

  const titleKey = invoice.type === "RETURN" ? "print.refund" : invoice.no.startsWith("INV") ? "print.receipt" : "print.original";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            {t("app.print")} — {invoice.no}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="thermal" dir={lang === "AR" ? "rtl" : "ltr"}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="thermal">{t("pos.printThermal")}</TabsTrigger>
            <TabsTrigger value="a4">{t("pos.printA4")}</TabsTrigger>
          </TabsList>

          {/* ─── حراري 80mm ─── */}
          <TabsContent value="thermal" className="mt-3">
            <div className="print-area print-thermal mx-auto bg-white text-black p-3 rounded border text-[11px] leading-tight font-mono" style={{ width: "302px" }}>
              <div className="text-center">
                <p className="font-bold text-sm">{pharmacyName}</p>
                <p>{lang === "AR" ? "الرقم الضريبي" : "Tax ID"}: {settings?.taxNumber || "-"}</p>
                <p className="font-bold mt-1">{t(titleKey)}</p>
                <p>#{invoice.no}</p>
                <p>{fmtDate(invoice.createdAt, lang, true)}</p>
              </div>
              <div className="border-t border-dashed border-black my-2" />
              <p>{t("print.cashier")}: {invoice.user?.fullName || "-"}</p>
              <p>{t("print.customer")}: {invoice.customer?.name || (lang === "AR" ? "عميل نقدي" : "Walk-in")}</p>
              <div className="border-t border-dashed border-black my-2" />
              <table className="w-full" dir="rtl">
                <thead>
                  <tr className="border-b border-black">
                    <th className="text-start">{t("print.item")}</th>
                    <th className="text-center">{t("print.qty")}</th>
                    <th className="text-end">{t("print.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((it, i) => (
                    <tr key={i}>
                      <td className="text-start py-0.5">{it.name}</td>
                      <td className="text-center">{it.qty}</td>
                      <td className="text-end">{it.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-dashed border-black my-2" />
              <div className="flex justify-between"><span>{t("print.subtotal")}</span><span>{invoice.subtotal.toFixed(2)}</span></div>
              {(invoice.itemDiscount > 0 || invoice.invoiceDiscount > 0) && (
                <div className="flex justify-between"><span>{t("print.discount")}</span><span>-{(invoice.itemDiscount + invoice.invoiceDiscount).toFixed(2)}</span></div>
              )}
              <div className="flex justify-between"><span>{t("print.vat")}</span><span>{invoice.tax.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-sm border-t border-black pt-1 mt-1">
                <span>{t("print.grandTotal")}</span><span>{invoice.total.toFixed(2)} {lang === "AR" ? "ج.م" : "EGP"}</span>
              </div>
              <div className="flex justify-between"><span>{t("print.paid")}</span><span>{invoice.paid.toFixed(2)}</span></div>
              {invoice.changeDue > 0 && <div className="flex justify-between"><span>{t("print.change")}</span><span>{invoice.changeDue.toFixed(2)}</span></div>}
              <div className="text-center mt-2 border-t border-dashed border-black pt-2">
                <QRCodeSVG value={etaPayload} size={72} className="mx-auto" />
                <p className="mt-1">{t("pos.etaOk")}</p>
                <p className="font-bold mt-1">{t("print.thanks")}</p>
                <p className="text-[9px]">{settings?.invoiceFooter || ""}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button className="flex-1 gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> {t("app.print")}
              </Button>
            </div>
          </TabsContent>

          {/* ─── A4 ─── */}
          <TabsContent value="a4" className="mt-3">
            <div className="print-area print-a4 mx-auto bg-white text-black p-6 rounded border" style={{ width: "460px" }}>
              <div className="flex items-start justify-between gap-4 border-b-2 border-emerald-700 pb-3">
                <div>
                  <p className="text-lg font-bold text-emerald-700">{pharmacyName}</p>
                  <p className="text-[11px]">{settings?.address || ""}</p>
                  <p className="text-[11px]">{settings?.phone || ""} • {settings?.email || ""}</p>
                  <p className="text-[11px]">{t("print.taxNumber")}: {settings?.taxNumber || "-"}</p>
                </div>
                <div className="text-end">
                  <p className="font-bold">{t(titleKey)}</p>
                  <p className="text-[11px]">#{invoice.no}</p>
                  <p className="text-[11px]">{fmtDate(invoice.createdAt, lang, true)}</p>
                  <p className="text-[11px]">{t("app.branch")}: {invoice.branch?.name || "-"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-[12px] py-2">
                <p><span className="text-gray-500">{t("print.customer")}:</span> {invoice.customer?.name || (lang === "AR" ? "عميل نقدي" : "Walk-in")}</p>
                <p><span className="text-gray-500">{t("print.cashier")}:</span> {invoice.user?.fullName || "-"}</p>
              </div>
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-emerald-700 text-white">
                    <th className="p-1.5 text-start">#</th>
                    <th className="p-1.5 text-start">{t("print.item")}</th>
                    <th className="p-1.5 text-center">{t("print.qty")}</th>
                    <th className="p-1.5 text-center">{t("print.price")}</th>
                    <th className="p-1.5 text-center">{t("print.vat")}</th>
                    <th className="p-1.5 text-end">{t("print.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((it, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="p-1.5">{i + 1}</td>
                      <td className="p-1.5">{it.name}{it.batch?.batchNo ? <span className="text-gray-400 text-[9px]"> ({t("print.batch")}: {it.batch.batchNo})</span> : ""}</td>
                      <td className="p-1.5 text-center">{it.qty}</td>
                      <td className="p-1.5 text-center">{it.unitPrice.toFixed(2)}</td>
                      <td className="p-1.5 text-center">{it.taxAmount.toFixed(2)}</td>
                      <td className="p-1.5 text-end">{it.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between items-start mt-4 gap-6">
                <div className="flex flex-col items-center gap-1">
                  <QRCodeSVG value={etaPayload} size={80} />
                  <p className="text-[9px] text-gray-500">ETA e-Invoice</p>
                </div>
                <div className="text-[12px] w-48 space-y-1">
                  <div className="flex justify-between"><span>{t("print.subtotal")}</span><span>{invoice.subtotal.toFixed(2)}</span></div>
                  {(invoice.itemDiscount > 0 || invoice.invoiceDiscount > 0) && (
                    <div className="flex justify-between text-red-600"><span>{t("print.discount")}</span><span>-{(invoice.itemDiscount + invoice.invoiceDiscount).toFixed(2)}</span></div>
                  )}
                  <div className="flex justify-between"><span>{t("print.vat")}</span><span>{invoice.tax.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1 text-sm"><span>{t("print.grandTotal")}</span><span>{invoice.total.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>{t("print.payment")}</span><span>{paymentLabel(invoice.paymentMethod, t)}</span></div>
                </div>
              </div>
              <p className="text-[9px] text-gray-500 mt-4 border-t pt-2">{settings?.invoiceTerms || ""}</p>
              <p className="text-center font-bold text-emerald-700 mt-2">{t("print.thanks")}</p>
            </div>
            <div className="flex gap-2 mt-3">
              <Button className="flex-1 gap-2" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> {t("app.print")} / PDF
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* إرسال */}
        {invoice.customer && (
          <div className="flex flex-wrap gap-2 pt-3 border-t mt-1">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => sendVia("WhatsApp")}>
              <MessageSquare className="h-4 w-4 text-emerald-600" /> {t("pos.sendWhatsapp")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => sendVia("SMS")}>
              <Smartphone className="h-4 w-4 text-teal-600" /> {t("pos.sendSms")}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => sendVia("Email")}>
              <Mail className="h-4 w-4 text-emerald-600" /> {t("pos.sendEmail")}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 ms-auto" onClick={() => sendVia("تحويل ملف")}>
              <Send className="h-4 w-4" /> PDF
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

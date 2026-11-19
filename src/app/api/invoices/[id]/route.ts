import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";

/** تفاصيل فاتورة كاملة — للطباعة والمرتجعات */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { tradeNameEn: true, barcode: true } }, batch: { select: { batchNo: true } } } },
        customer: true,
        user: { select: { fullName: true } },
        branch: true,
        originalInvoice: { select: { no: true, createdAt: true } },
        refunds: { select: { id: true, no: true, total: true, createdAt: true } },
      },
    });
    if (!invoice) throw new ApiError(404, "الفاتورة غير موجودة");
    return NextResponse.json(invoice);
  } catch (e) {
    return handleApiError(e);
  }
}

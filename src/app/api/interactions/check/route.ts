import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, handleApiError, ApiError } from "@/lib/server/auth";

/** فحص التداخلات الدوائية والحساسية قبل الصرف */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { productIds, customerId } = body ?? {};
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ interactions: [], allergies: [] });
    }

    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      include: { activeIngredient: true },
    });

    // ── التداخلات بين أصناف السلة ──
    const ingredientIds = products.map((p) => p.activeIngredientId).filter(Boolean) as string[];
    let interactions: Array<{ severity: string; description: string; ingredients: string }> = [];
    if (ingredientIds.length >= 2) {
      const rules = await db.drugInteraction.findMany({
        where: {
          OR: [
            { ingredientAId: { in: ingredientIds }, ingredientBId: { in: ingredientIds } },
          ],
        },
        include: { ingredientA: true, ingredientB: true },
      });
      interactions = rules.map((r) => ({
        severity: r.severity,
        description: r.description,
        ingredients: `${r.ingredientA.name} + ${r.ingredientB.name}`,
      }));
    }

    // ── حساسية العميل ──
    let allergies: Array<{ ingredient: string; product: string }> = [];
    if (customerId) {
      const customer = await db.customer.findUnique({ where: { id: customerId }, select: { allergies: true } });
      if (customer?.allergies) {
        const parts = customer.allergies.split(/[،,]/).map((s) => s.trim()).filter(Boolean);
        for (const p of products) {
          const ing = p.activeIngredient;
          if (!ing) continue;
          const hit = parts.find((a) => {
            const la = a.toLowerCase();
            return (
              la.includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(la) ||
              (ing.nameEn && (la.includes(ing.nameEn.toLowerCase()) || ing.nameEn.toLowerCase().includes(la)))
            );
          });
          if (hit) allergies.push({ ingredient: ing.name, product: p.tradeName });
        }
      }
    }

    return NextResponse.json({ interactions, allergies });
  } catch (e) {
    return handleApiError(e);
  }
}

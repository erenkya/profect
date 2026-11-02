import { requireUser } from "@/lib/auth";
import { fail, getBaseUrl, ok, parseBody, serverError } from "@/lib/http";
import pool from "@/lib/db";
import { checkoutSchema } from "@/lib/checkout-schema";
import { quoteCart } from "@/lib/cart-quote";
import { allocateDiscount, computeDiscount } from "@/lib/coupon-schema";
import { validateCoupon } from "@/lib/coupons";
import { createCartOrder } from "@/lib/orders";
import { fulfillOrder } from "@/lib/lms";
import { paymentProvider } from "@/lib/payment";
import { startTamiCheckout } from "@/lib/payment/start-tami";

/**
 * Sepetten sipariş oluşturur. Fiyat DAİMA sunucuda DB'den hesaplanır (istemciden tutar alınmaz).
 * Dört yasal onay (mesafeli satış, gizlilik, teslimat/iade, KVKK) sunucuda da zorunludur.
 * Sağlayıcıya göre sonuç:
 *   manual → { status: "pending" }  (para alınmaz; admin onaylar)
 *   mock   → { status: "paid" }     (yalnızca geliştirme)
 *   tami   → { status: "redirect", threeDSHtmlContent }  (3D Secure; sonuç /api/checkout/tami-callback'te)
 */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, checkoutSchema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;
  const { billing, card } = body.data;
  const provider = paymentProvider();

  try {
    const quote = await quoteCart(body.data.items, userId);
    if (quote.payable.length === 0) return fail("Sepetinizde satın alınabilir ürün yok.", 409);
    // Kupon: sunucuda yeniden doğrulanır ve hesaplanır (ön izlemedeki tutara güvenilmez).
    let coupon: { id: number; code: string } | null = null;
    let discount = 0;
    let total = quote.total;
    if (body.data.coupon_code) {
      const v = await validateCoupon({ code: body.data.coupon_code, userId });
      if (!v.ok) return fail(v.message, 400);
      const d = computeDiscount(quote.total, v.coupon.discount_type, v.coupon.discount_value);
      coupon = { id: v.coupon.id, code: v.coupon.code };
      discount = d.discount;
      total = d.total;
    }
    const free = total <= 0; // %100 indirim: tahsilat yok, sipariş anında tamamlanır
    if (!free && provider.requiresCard && !card) return fail("Kart bilgileri eksik.", 400);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const orderId = await createCartOrder({ userId, lines: quote.payable, total, billing, provider: free ? "free" : provider.id, ip, coupon, discount });

    if (free) {
      await fulfillOrder(orderId);
      return ok({ orderId, status: "paid" }, 201);
    }
    if (provider.id === "mock") {
      await fulfillOrder(orderId);
      return ok({ orderId, status: "paid" }, 201);
    }
    if (provider.id === "manual") return ok({ orderId, status: "pending" }, 201);

    // ── Tami 3D Secure ──
    const netPrices = allocateDiscount(quote.payable.map((x) => x.price), discount);
    const r = await startTamiCheckout({
      orderId, total, billing, card: card!, ip, userId, baseUrl: getBaseUrl(request),
      // Sepet toplamı tahsil edilen tutara eşit olmalı: kupon indirimi kalemlere orantılı dağıtılır.
      basket: quote.payable.map((l, i) => ({ key: l.key, title: l.title, subCategory: l.item.type === "plus" ? "Abonelik" : l.item.type === "program" ? "Program" : "Kurs", price: netPrices[i] })),
    });
    if (!r.ok) return fail(r.message, 400);
    return ok({ orderId, status: "redirect", threeDSHtmlContent: r.threeDSHtmlContent }, 201);
  } catch (err) {
    return serverError("[POST /api/checkout]", err);
  }
}

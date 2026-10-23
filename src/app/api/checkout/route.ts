import { requireUser } from "@/lib/auth";
import { fail, getBaseUrl, ok, parseBody, serverError } from "@/lib/http";
import pool from "@/lib/db";
import { checkoutSchema, normalizePhone } from "@/lib/checkout-schema";
import { quoteCart } from "@/lib/cart-quote";
import { createCartOrder } from "@/lib/orders";
import { fulfillOrder } from "@/lib/lms";
import { paymentProvider } from "@/lib/payment";
import { authPayment3D } from "@/lib/payment/tami";

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
    if (provider.requiresCard && !card) return fail("Kart bilgileri eksik.", 400);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const orderId = await createCartOrder({ userId, lines: quote.payable, total: quote.total, billing, provider: provider.id, ip });

    if (provider.id === "mock") {
      await fulfillOrder(orderId);
      return ok({ orderId, status: "paid" }, 201);
    }
    if (provider.id === "manual") return ok({ orderId, status: "pending" }, 201);

    // ── Tami 3D Secure ──
    const [mm, yy] = card!.expiry.split("/").map(Number);
    const ref = `PRF${orderId}T${Date.now()}`; // her deneme Tami'de benzersiz olmalı
    await pool.execute("UPDATE orders SET provider_ref = ? WHERE id = ?", [ref, orderId]);
    const [first, ...rest] = billing.full_name.split(/\s+/);
    const now = new Date().toISOString().replace("Z", "");
    const address = {
      address: billing.address, city: billing.city, district: billing.district, country: "Türkiye", zipCode: billing.zip_code,
      companyName: billing.invoice_type === "kurumsal" ? billing.company_name : undefined,
      contactName: billing.full_name, phoneNumber: normalizePhone(billing.phone)!, emailAddress: billing.email,
    };
    const data = await authPayment3D({
      orderId: ref,
      amount: quote.total,
      currency: "TRY",
      installmentCount: 1,
      paymentGroup: "PRODUCT",
      paymentChannel: "WEB",
      callbackUrl: `${(process.env.APP_URL || getBaseUrl(request)).replace(/\/+$/, "")}/api/checkout/tami-callback`,
      card: { number: card!.number, holderName: card!.holder_name, expireMonth: mm, expireYear: 2000 + yy, cvv: card!.cvv },
      buyer: {
        ipAddress: ip, buyerId: String(userId), name: first, surName: rest.join(" ") || first,
        identityNumber: billing.invoice_type === "bireysel" ? billing.tckn : billing.tax_number,
        emailAddress: billing.email, phoneNumber: address.phoneNumber, city: billing.city, country: "Türkiye", zipCode: billing.zip_code,
        registrationAddress: billing.address, registrationDate: now, lastLoginDate: now,
      },
      billingAddress: address,
      shippingAddress: address,
      basket: {
        basketId: ref,
        basketItems: quote.payable.map((l) => ({
          itemId: l.key, name: l.title.slice(0, 100), itemType: "PHYSICAL", category: "Eğitim", subCategory: l.item.type === "plus" ? "Abonelik" : "Kurs",
          numberOfProducts: 1, unitPrice: l.price, totalPrice: l.price,
        })),
      },
    });
    if (!data.success) {
      await pool.execute("UPDATE orders SET status = 'rejected', error_message = ? WHERE id = ?", [String(data.errorMessage).slice(0, 255), orderId]);
      return fail(data.errorMessage || "Ödeme başlatılamadı.", 400);
    }
    return ok({ orderId, status: "redirect", threeDSHtmlContent: data.threeDSHtmlContent }, 201);
  } catch (err) {
    return serverError("[POST /api/checkout]", err);
  }
}

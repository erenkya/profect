import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ok, parseBody, serverError } from "@/lib/http";
import { cartItemsSchema } from "@/lib/checkout-schema";
import { quoteCart } from "@/lib/cart-quote";
import { paymentProvider } from "@/lib/payment";

/** Sepet kalemlerini güncel fiyat/başlıkla döner. Girişsiz de çalışır (sepet misafirken doldurulur). */
export async function POST(request: Request) {
  const body = await parseBody(request, z.object({ items: cartItemsSchema }));
  if (body.error) return body.error;
  try {
    const user = await getCurrentUser();
    const quote = await quoteCart(body.data.items, user?.id);
    return ok({ lines: quote.lines, total: quote.total, loggedIn: !!user, provider: paymentProvider().id });
  } catch (err) {
    return serverError("[POST /api/cart/quote]", err);
  }
}

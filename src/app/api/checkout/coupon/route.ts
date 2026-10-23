import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { cartItemsSchema } from "@/lib/checkout-schema";
import { computeDiscount, describeDiscount } from "@/lib/coupon-schema";
import { validateCoupon } from "@/lib/coupons";
import { quoteCart } from "@/lib/cart-quote";

/** Ödeme sayfasındaki "Uygula" düğmesi: yalnızca ön izleme. Tahsil edilecek tutarı /api/checkout yeniden hesaplar. */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ code: z.string().trim().min(1, "Kupon kodunu girin.").max(60), items: cartItemsSchema.min(1) }));
  if (body.error) return body.error;
  try {
    const quote = await quoteCart(body.data.items, guard.payload.userId);
    if (quote.payable.length === 0) return fail("Sepetinizde satın alınabilir ürün yok.", 409);
    const v = await validateCoupon({ code: body.data.code, userId: guard.payload.userId });
    if (!v.ok) return fail(v.message, 400);
    const { discount, total } = computeDiscount(quote.total, v.coupon.discount_type, v.coupon.discount_value);
    return ok({ coupon: { code: v.coupon.code, label: describeDiscount(v.coupon.discount_type, v.coupon.discount_value) }, subtotal: quote.total, discount, total });
  } catch (err) {
    return serverError("[POST /api/checkout/coupon]", err);
  }
}

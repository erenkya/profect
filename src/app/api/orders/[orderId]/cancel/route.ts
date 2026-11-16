import { requireUser } from "@/lib/auth";
import { fail, ok, parseId, serverError } from "@/lib/http";
import { cancelMyOrder } from "@/lib/lms";

/** Sipariş sahibi onay bekleyen siparişini iptal eder. Yetki: yalnızca kendi siparişi (başkasının siparişi ile olmayan sipariş aynı 404). */
export async function POST(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const orderId = parseId((await params).orderId);
  if (!orderId) return fail("Sipariş bulunamadı.", 404);
  try {
    const r = await cancelMyOrder(guard.payload.userId, orderId);
    if (r === "cancelled") return ok({ message: "Siparişin iptal edildi." });
    if (r === "not_found") return fail("Sipariş bulunamadı.", 404);
    return fail("Bu sipariş artık iptal edilemez; yalnızca onay bekleyen siparişler iptal edilebilir.", 409);
  } catch (err) {
    return serverError("[POST /api/orders/:id/cancel]", err);
  }
}

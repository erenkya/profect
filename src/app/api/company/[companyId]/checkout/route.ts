import { requireCompanyAccess } from "@/lib/company-guard";
import { seatCheckoutSchema, seatOrderTitle } from "@/lib/company-rules";
import { fail, getBaseUrl, ok, parseBody, parseId, serverError } from "@/lib/http";
import { fulfillOrder, getCourseBySlug } from "@/lib/lms";
import { createSeatOrder } from "@/lib/orders";
import { paymentProvider } from "@/lib/payment";
import { startTamiCheckout } from "@/lib/payment/start-tami";

/**
 * Şirket kontenjanı siparişi (şirket admini ya da ana admin): kurs + adet. Fiyat DAİMA sunucuda DB'den (birim fiyat × adet) hesaplanır;
 * kupon yoktur (hediye siparişi gibi). Sonuç şekli /api/checkout ile aynı: pending (manual) · paid (mock) · redirect (tami 3D Secure).
 * Ödeme onaylanınca `fulfillOrder` kurs kaydı açmaz, şirketin kontenjanını artırır.
 */
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const body = await parseBody(request, seatCheckoutSchema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;
  const { slug, quantity, billing, card } = body.data;
  const provider = paymentProvider();

  try {
    const course = await getCourseBySlug(slug);
    if (!course) return fail("Kurs bulunamadı.", 404);
    if (course.price <= 0) return fail("Ücretsiz kurslar için kontenjan satın alınamaz.", 400);
    if (provider.requiresCard && !card) return fail("Kart bilgileri eksik.", 400);

    const total = Math.round(course.price * quantity * 100) / 100;
    const title = seatOrderTitle(course.title, quantity);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const orderId = await createSeatOrder({ userId, companyId, courseId: course.id, title, quantity, total, billing, provider: provider.id, ip });

    if (provider.id === "mock") {
      await fulfillOrder(orderId);
      return ok({ orderId, status: "paid" }, 201);
    }
    if (provider.id === "manual") return ok({ orderId, status: "pending" }, 201);

    const r = await startTamiCheckout({
      orderId, total, billing, card: card!, ip, userId, baseUrl: getBaseUrl(request),
      basket: [{ key: `seats:${course.slug}`, title, subCategory: "Kontenjan", price: total }],
    });
    if (!r.ok) return fail(r.message, 400);
    return ok({ orderId, status: "redirect", threeDSHtmlContent: r.threeDSHtmlContent }, 201);
  } catch (err) {
    return serverError("[POST /api/company/:id/checkout]", err);
  }
}

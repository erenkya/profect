import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import { requireUser } from "@/lib/auth";
import { fail, getBaseUrl, ok, parseBody, serverError } from "@/lib/http";
import { GIFT_MAX_CREATED_PER_HOUR, giftCheckoutSchema, isSelfGift } from "@/lib/gift-rules";
import { cancelGiftsForOrder, countRecentGiftsBySender, createGiftOrder } from "@/lib/gifts";
import { fulfillOrder, getCourseBySlug } from "@/lib/lms";
import { paymentProvider } from "@/lib/payment";
import { startTamiCheckout } from "@/lib/payment/start-tami";

/**
 * Tek kurs hediyesi için sipariş oluşturur. Fiyat DAİMA sunucuda DB'den okunur; kupon yoktur (v1).
 * Alıcının hesabı olup olmadığı ya da kursa sahip olup olmadığı BURADA kontrol edilmez (hesap varlığı sızmasın).
 * Sonuç şekli /api/checkout ile aynı: pending (manual) · paid (mock) · redirect (tami 3D Secure).
 */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, giftCheckoutSchema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;
  const { slug, recipient_email, message, billing, card } = body.data;
  const provider = paymentProvider();

  try {
    const course = await getCourseBySlug(slug);
    if (!course) return fail("Kurs bulunamadı.", 404);
    if (course.price <= 0) return fail("Ücretsiz kurslar hediye edilemez.", 400);

    const [rows] = await pool.query<RowDataPacket[]>("SELECT email FROM users WHERE id = ?", [userId]);
    if (!rows[0] || isSelfGift(rows[0].email, recipient_email)) {
      return fail("Kendinize hediye gönderemezsiniz; kursu normal satın alabilirsiniz.", 400);
    }
    if ((await countRecentGiftsBySender(userId)) >= GIFT_MAX_CREATED_PER_HOUR) {
      return fail("Kısa sürede çok fazla hediye oluşturdunuz. Lütfen biraz sonra tekrar deneyin.", 429);
    }
    if (provider.requiresCard && !card) return fail("Kart bilgileri eksik.", 400);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const { orderId } = await createGiftOrder({
      senderId: userId, courseId: course.id, courseTitle: course.title, price: course.price,
      recipientEmail: recipient_email, message: message || null, billing, provider: provider.id, ip,
    });

    if (provider.id === "mock") {
      await fulfillOrder(orderId);
      return ok({ orderId, status: "paid" }, 201);
    }
    if (provider.id === "manual") return ok({ orderId, status: "pending" }, 201);

    const r = await startTamiCheckout({
      orderId, total: course.price, billing, card: card!, ip, userId, baseUrl: getBaseUrl(request),
      basket: [{ key: `course:${course.slug}`, title: course.title, subCategory: "Kurs", price: course.price }],
    });
    if (!r.ok) {
      await cancelGiftsForOrder(orderId);
      return fail(r.message, 400);
    }
    return ok({ orderId, status: "redirect", threeDSHtmlContent: r.threeDSHtmlContent }, 201);
  } catch (err) {
    return serverError("[POST /api/gifts/checkout]", err);
  }
}

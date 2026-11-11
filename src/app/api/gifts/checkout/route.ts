import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import { requireUser } from "@/lib/auth";
import { fail, getBaseUrl, ok, parseBody, serverError } from "@/lib/http";
import { GIFT_MAX_CREATED_PER_HOUR, giftCheckoutSchema, isSelfGift } from "@/lib/gift-rules";
import { cancelGiftsForOrder, countRecentGiftsBySender, createGiftOrder, type GiftTarget } from "@/lib/gifts";
import { fulfillOrder, getCourseBySlug } from "@/lib/lms";
import { paymentProvider } from "@/lib/payment";
import { startTamiCheckout } from "@/lib/payment/start-tami";
import { getProgramOffer } from "@/lib/programs";
import { allocateVat, withVat } from "@/lib/vat";

/**
 * Tek kurs ya da Uzmanlık Programı hediyesi için sipariş oluşturur (`kind`, varsayılan "course"; slug ona göre aranır, yani
 * bir türün slug'ı diğerinde 404 verir). Fiyat DAİMA sunucuda DB'den okunur; kupon yoktur (v1).
 * Program hediyesinin fiyatı B' (gönderenin sahip olduğu kurslardan bağımsız); satışa kapalı (yayından kalkmış/ücretsiz kursu olan) program hediye edilemez.
 * Alıcının hesabı olup olmadığı ya da kursa sahip olup olmadığı BURADA kontrol edilmez (hesap varlığı sızmasın).
 * Sonuç şekli /api/checkout ile aynı: pending (manual) · paid (mock) · redirect (tami 3D Secure).
 */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, giftCheckoutSchema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;
  const { kind, slug, recipient_email, message, billing, card } = body.data;
  const provider = paymentProvider();

  try {
    // Hediye edilen şey: kurs ya da program (türe göre tek sorgu; diğer türün slug'ı burada bulunamaz).
    let target: GiftTarget;
    let price: number;
    let basketItem: { key: string; title: string; subCategory: "Kurs" | "Program"; price: number };
    if (kind === "program") {
      const offer = await getProgramOffer(slug, null);
      if (!offer) return fail("Program bulunamadı.", 404);
      if (!offer.sellable) return fail("Bu program şu anda satışta olmadığı için hediye edilemez.", 409);
      price = offer.calc.effectivePrice;
      if (price <= 0) return fail("Ücretsiz programlar hediye edilemez.", 400);
      target = { kind: "program", programId: offer.program.id, title: offer.program.title };
      basketItem = { key: `program:${offer.program.slug}`, title: offer.program.title, subCategory: "Program", price };
    } else {
      const course = await getCourseBySlug(slug);
      if (!course) return fail("Kurs bulunamadı.", 404);
      if (course.price <= 0) return fail("Ücretsiz kurslar hediye edilemez.", 400);
      price = course.price;
      target = { kind: "course", courseId: course.id, title: course.title };
      basketItem = { key: `course:${course.slug}`, title: course.title, subCategory: "Kurs", price };
    }

    const [rows] = await pool.query<RowDataPacket[]>("SELECT email FROM users WHERE id = ?", [userId]);
    if (!rows[0] || isSelfGift(rows[0].email, recipient_email)) {
      return fail(kind === "program" ? "Kendinize hediye gönderemezsiniz; programı normal satın alabilirsiniz." : "Kendinize hediye gönderemezsiniz; kursu normal satın alabilirsiniz.", 400);
    }
    if ((await countRecentGiftsBySender(userId)) >= GIFT_MAX_CREATED_PER_HOUR) {
      return fail("Kısa sürede çok fazla hediye oluşturdunuz. Lütfen biraz sonra tekrar deneyin.", 429);
    }
    if (provider.requiresCard && !card) return fail("Kart bilgileri eksik.", 400);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const charge = withVat(price).gross; // fiyat KDV hariç; tahsil edilen tutar KDV dahil
    const { orderId } = await createGiftOrder({
      senderId: userId, target, price, amount: charge,
      recipientEmail: recipient_email, message: message || null, billing, provider: provider.id, ip,
    });

    if (provider.id === "mock") {
      await fulfillOrder(orderId);
      return ok({ orderId, status: "paid" }, 201);
    }
    if (provider.id === "manual") return ok({ orderId, status: "pending" }, 201);

    const r = await startTamiCheckout({
      orderId, total: charge, billing, card: card!, ip, userId, baseUrl: getBaseUrl(request),
      basket: [{ ...basketItem, price: allocateVat([price])[0] }],
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

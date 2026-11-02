import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { giftUrl, rotateGiftToken, sendGiftEmails } from "@/lib/gifts";

const schema = z.object({ mode: z.enum(["copy", "email"]) });

/**
 * Gönderenin hediye linkini yenilemesi: token döndürülür (önceki link geçersiz olur), yeni link yanıtta bir kez döner.
 * mode "email" ise alıcıya yeni linkli mail de gider. Yalnızca hediyenin sahibi (sender_id) ve yalnızca `pending` hediye.
 */
export async function POST(request: Request, { params }: { params: Promise<{ giftId: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const id = parseId((await params).giftId);
  if (!id) return fail("Geçersiz hediye.", 400);
  const body = await parseBody(request, schema);
  if (body.error) return body.error;

  try {
    const r = await rotateGiftToken(id, guard.payload.userId);
    if (r.status === "not_found") return fail("Hediye bulunamadı.", 404);
    if (r.status === "rate_limited") {
      return NextResponse.json(
        { success: false, message: `Kısa süre önce işlem yaptınız. ${r.retryAfter} saniye sonra tekrar deneyin.`, retryAfter: r.retryAfter },
        { status: 429 },
      );
    }
    if (body.data.mode === "email") after(() => sendGiftEmails(id, r.token, "recipient"));
    return ok({ link: giftUrl(r.token), emailed: body.data.mode === "email" });
  } catch (err) {
    return serverError("[POST /api/gifts/:id/link]", err);
  }
}

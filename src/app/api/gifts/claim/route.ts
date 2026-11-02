import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { GIFT_INVALID_MESSAGE, isGiftToken } from "@/lib/gift-rules";
import { claimGift } from "@/lib/gifts";

const schema = z.object({ token: z.string().max(200).refine(isGiftToken, GIFT_INVALID_MESSAGE) });

/** Hediyeyi alır. Yetki: oturumdaki doğrulanmış hesabın maili hediyedeki adresle birebir eşleşmeli (claimGift içinde, kilitli transaction). */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return fail(GIFT_INVALID_MESSAGE, 404);

  try {
    const r = await claimGift(body.data.token, guard.payload.userId);
    if (r.ok) return ok({ courseSlug: r.courseSlug });
    switch (r.reason) {
      case "wrong_account":
        return fail("Bu hediye başka bir hesaba ait. Hediyenin gönderildiği e-posta adresiyle giriş yapın.", 403);
      case "unverified":
        return fail("Hediyeyi alabilmek için e-posta adresinizi doğrulamalısınız.", 403);
      case "already_owned":
        return fail("Bu kursa zaten sahipsin. Hediye hesabına eklenmedi.", 409);
      default:
        return fail(GIFT_INVALID_MESSAGE, 404);
    }
  } catch (err) {
    return serverError("[POST /api/gifts/claim]", err);
  }
}

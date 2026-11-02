// Kurs ve Uzmanlık Programı hediyesinin saf (DB/ağ içermeyen) kuralları: sabitler, mail normalizasyonu, token biçimi, alma kararı ve ödeme şeması.
// `server-only` içermez; node --test ile doğrudan yüklenebilir.
import { z } from "zod";
import { billingSchema, cardSchema, consentsSchema } from "./checkout-schema.ts";

/** Hediye linkinin geçerlilik süresi (gün); ödeme onayından itibaren. */
export const GIFT_TTL_DAYS = 30;
export const GIFT_MESSAGE_MAX = 300;
/** Aynı hediye için mail yeniden gönderme / link yenileme arasındaki en kısa süre (saniye). */
export const GIFT_RESEND_COOLDOWN_SECONDS = 60;
export const GIFT_MAX_SENDS_PER_WINDOW = 5;
export const GIFT_SEND_WINDOW_MINUTES = 60;
/** Bir gönderenin saat içinde oluşturabileceği en fazla hediye (mail bombalamaya karşı). */
export const GIFT_MAX_CREATED_PER_HOUR = 10;
/** Bulunamayan, süresi dolan, alınan ya da iptal edilen linkler için tek tip mesaj (bilgi sızdırmaz). */
export const GIFT_INVALID_MESSAGE = "Bu hediye linki geçersiz veya süresi dolmuş.";

export type GiftStatus = "awaiting_payment" | "pending" | "claimed" | "expired" | "cancelled";
export type GiftClaimReason = "invalid" | "wrong_account" | "unverified" | "already_owned";

export const normalizeRecipientEmail = (v: string): string => v.trim().toLowerCase();

export const isSelfGift = (senderEmail: string, recipientEmail: string): boolean =>
  normalizeRecipientEmail(senderEmail) === normalizeRecipientEmail(recipientEmail);

/** Token'ın biçimi: `randomBytes(32).toString("hex")`. Bozuk girdi DB'ye hiç gitmeden elenir. */
export const isGiftToken = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/** "ayse@gmail.com" → "a***@gmail.com" (yanlış hesapla açılan sayfada adres tam gösterilmez). */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * Hediyenin bu kullanıcı tarafından alınıp alınamayacağı. `null` = alınabilir.
 * Sıra: invalid (yok / pending değil / süresi geçmiş) → wrong_account → unverified → already_owned.
 */
export function claimBlock(
  gift: { status: GiftStatus; secondsLeft: number; recipientEmail: string } | null,
  user: { email: string; emailVerified: boolean },
  alreadyOwns: boolean,
): GiftClaimReason | null {
  if (!gift || gift.status !== "pending" || gift.secondsLeft <= 0) return "invalid";
  if (normalizeRecipientEmail(user.email) !== normalizeRecipientEmail(gift.recipientEmail)) return "wrong_account";
  if (!user.emailVerified) return "unverified";
  if (alreadyOwns) return "already_owned";
  return null;
}

/** Sipariş listelerinde hediye siparişini ayırt etmek için: "Kurs (hediye → alıcı@…)". */
export const giftOrderLabel = (label: string, giftTo: string | null | undefined): string =>
  giftTo ? `${label} (hediye → ${giftTo})` : label;

export const GIFT_KINDS = ["course", "program"] as const;
export type GiftKind = (typeof GIFT_KINDS)[number];

export const giftCheckoutSchema = z.object({
  /** Hediye edilen şey: kurs (varsayılan) ya da Uzmanlık Programı; `slug` ona göre kursun/programın slug'ıdır. */
  kind: z.enum(GIFT_KINDS).default("course"),
  slug: z.string().min(1).max(120),
  recipient_email: z.string().trim().toLowerCase().email("Geçerli bir alıcı e-postası girin.").max(190),
  message: z.string().trim().max(GIFT_MESSAGE_MAX, `Not en fazla ${GIFT_MESSAGE_MAX} karakter olabilir.`).optional(),
  billing: billingSchema,
  consents: consentsSchema,
  card: cardSchema.optional(),
});
export type GiftCheckoutInput = z.infer<typeof giftCheckoutSchema>;

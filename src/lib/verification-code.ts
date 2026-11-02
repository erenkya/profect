// E-posta doğrulama kodunun saf (DB/ağ içermeyen) parçaları: üretim, özetleme, karşılaştırma ve ilkeler.
// Kod 6 haneli olduğu için düz SHA-256 özeti saniyeler içinde kırılırdı; bu yüzden sunucu sırrı ve
// kullanıcı kimliğiyle anahtarlı HMAC kullanılır, deneme sayısı da ayrıca sınırlanır.
import crypto from "node:crypto";

export const CODE_LENGTH = 6;
/** Kodun geçerlilik süresi (dakika). */
export const CODE_TTL_MINUTES = 10;
/** Bir kod için izin verilen yanlış deneme sayısı; dolunca yeni kod istenmeli. */
export const MAX_ATTEMPTS = 5;
/** İki gönderim arasındaki en kısa süre (saniye). */
export const RESEND_COOLDOWN_SECONDS = 60;
/** Bir saatlik pencerede bir hesaba gönderilebilecek en çok kod sayısı. */
export const MAX_SENDS_PER_WINDOW = 5;
export const SEND_WINDOW_MINUTES = 60;

/** Kriptografik olarak rastgele, başı sıfırla doldurulmuş 6 haneli kod. */
export function generateCode(): string {
  return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** Kullanıcının yazdığı kodu normalleştirir ("123 456", "123-456") ve geçerliyse döner. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(digits) ? digits : null;
}

/** Kodun HMAC-SHA256 özeti (hex, 64 karakter). Kullanıcıya bağlıdır: başka hesabın kodu geçmez. */
export function hashCode(userId: number, code: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`email-verification:${userId}:${code}`).digest("hex");
}

/** Sabit zamanlı özet karşılaştırması (zamanlama farkından bilgi sızmasın). */
export function codeMatches(storedHash: string | null | undefined, userId: number, code: string, secret: string): boolean {
  if (!storedHash || storedHash.length !== 64) return false;
  const expected = Buffer.from(hashCode(userId, code, secret), "hex");
  const actual = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export type VerifyState = {
  emailVerified: boolean;
  hasCode: boolean;
  /** Kodun bitimine kalan saniye (≤ 0 ise süresi dolmuş). */
  secondsLeft: number;
  attempts: number;
};

export type VerifyBlock = "invalid" | "expired" | "locked" | null;

/** Kod karşılaştırılmadan önce engelleyen bir durum var mı? `invalid` = hesap yok / zaten doğrulanmış / kod yok. */
export function verifyBlock(state: VerifyState | null): VerifyBlock {
  if (!state || state.emailVerified || !state.hasCode) return "invalid";
  if (state.secondsLeft <= 0) return "expired";
  if (state.attempts >= MAX_ATTEMPTS) return "locked";
  return null;
}

export const VERIFY_MESSAGES = {
  invalid: "Doğrulama kodu geçersiz. Lütfen yeni bir kod isteyin.",
  expired: "Kodun süresi doldu. Yeni bir kod isteyebilirsiniz.",
  locked: "Çok fazla hatalı deneme yaptınız. Güvenliğiniz için yeni bir kod isteyin.",
  wrong: (remaining: number) => `Kod hatalı. ${remaining} deneme hakkınız kaldı.`,
} as const;

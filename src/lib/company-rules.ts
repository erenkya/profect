// Şirket hesapları ve kontenjan sisteminin saf (DB/ağ içermeyen) kuralları: şirket kodu, mail uzantısı, kayıt şemaları,
// atama/geri alma kararı, ilerleme durumu ve kontenjan siparişi şeması.
// `server-only` içermez; node --test ile doğrudan yüklenebilir.
import { randomInt } from "node:crypto";
import { z } from "zod";
import { billingSchema, cardSchema, consentsSchema } from "./checkout-schema.ts";
import { SEAT_MAX_QUANTITY, seatQuantitySchema } from "./seat-quantity.ts";

export { SEAT_MAX_QUANTITY };

export const MEMBER_PURCHASE_BLOCK_MESSAGE = "Şirket hesabına bağlı olduğunuz için bireysel satın alma yapılamaz. Şirket yöneticinizden talep edebilirsiniz.";

// ── Şirket kodu ───────────────────────────────────────────────────────────────
/** Karıştırılan karakterler (0, O, 1, I) yok. */
export const COMPANY_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_RE = /^[A-Z]{2,6}-[2-9A-HJ-NP-Z]{4}$/;

const TR_FOLD: Record<string, string> = { ç: "C", Ç: "C", ğ: "G", Ğ: "G", ı: "I", İ: "I", ö: "O", Ö: "O", ş: "S", Ş: "S", ü: "U", Ü: "U" };

function codePrefix(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? "";
  const letters = [...firstWord].map((ch) => TR_FOLD[ch] ?? ch.toUpperCase()).filter((ch) => /^[A-Z]$/.test(ch)).join("");
  return letters.length >= 2 ? letters.slice(0, 6) : "FRM";
}

/** "Acme A.Ş." → "ACME-7K4Q": ad kökü + 4 karakterlik karışması zor sonek. `pick(n)` 0..n-1 arası sayı döndürür. */
export function generateCompanyCode(name: string, pick: (n: number) => number = (n) => randomInt(n)): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += COMPANY_CODE_ALPHABET[pick(COMPANY_CODE_ALPHABET.length)];
  return `${codePrefix(name)}-${suffix}`;
}

export const normalizeCompanyCode = (v: string): string => v.replace(/\s+/g, "").toUpperCase();

export const isCompanyCode = (v: unknown): v is string => typeof v === "string" && CODE_RE.test(v);

// ── Mail uzantısı ─────────────────────────────────────────────────────────────
/** Şirket uzantısı olarak kabul edilmeyen genel posta sağlayıcıları. */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.tr", "outlook.com", "outlook.com.tr", "live.com", "msn.com",
  "yahoo.com", "yahoo.com.tr", "icloud.com", "me.com", "yandex.com", "yandex.com.tr", "mynet.com", "proton.me", "protonmail.com",
]);

const DOMAIN_RE = /^(?=.{3,190}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** "@Acme.COM " → "acme.com"; geçersizse null. */
export function normalizeDomain(v: string): string | null {
  const d = v.trim().replace(/^@/, "").toLowerCase();
  return DOMAIN_RE.test(d) ? d : null;
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at > 0 ? normalizeDomain(email.slice(at + 1)) : null;
}

export const isPublicDomain = (d: string): boolean => PUBLIC_EMAIL_DOMAINS.has(d.toLowerCase());

/** Kurumsal kayıtta kayıt olanın e-postası, girdiği şirket uzantısıyla aynı olmalı. */
export function corporateEmailBlock(email: string, domain: string): "domain_mismatch" | null {
  return emailDomain(email) === domain.toLowerCase() ? null : "domain_mismatch";
}

// ── Kayıt şemaları ────────────────────────────────────────────────────────────
const text = (label: string, max: number, min = 2) =>
  z.string({ required_error: `${label} zorunludur.` }).trim().min(min, `${label} zorunludur.`).max(max, `${label} en fazla ${max} karakter olabilir.`);

export const corporateCompanySchema = z.object({
  company_name: text("Şirket adı", 200),
  tax_office: text("Vergi dairesi", 120),
  tax_number: z.string().trim().regex(/^\d{10}$/, "Vergi numarası 10 haneli olmalı."),
  domain: z.string().max(190).transform((v, ctx) => {
    const d = normalizeDomain(v);
    if (!d || isPublicDomain(d)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Şirket mail uzantısı geçerli bir kurumsal alan adı olmalı." });
      return z.NEVER;
    }
    return d;
  }),
});
export type CorporateCompany = z.infer<typeof corporateCompanySchema>;

/** Boş ya da yok → undefined; doluysa biçimi doğrulanır ve normalize edilir. */
const optionalCompanyCode = z
  .string()
  .max(40)
  .optional()
  .transform((v) => (v && v.trim() ? normalizeCompanyCode(v) : undefined))
  .refine((v) => v === undefined || isCompanyCode(v), "Şirket kodu geçersiz.");

export const signupFieldsSchema = z.discriminatedUnion("account_type", [
  z.object({ account_type: z.literal("bireysel"), company_code: optionalCompanyCode }),
  z.object({ account_type: z.literal("kurumsal"), company: corporateCompanySchema }),
]);
export type SignupFields = z.infer<typeof signupFieldsSchema>;

// ── Kontenjan ─────────────────────────────────────────────────────────────────
export type AssignBlockReason = "not_member" | "burned" | "already_owned" | "no_free";

/** Atamanın engeli (null = verilebilir). Sıra: not_member → burned → already_owned → no_free. */
export function assignBlock(i: { free: number; member: "active" | "other"; burned: boolean; alreadyHasAccess: boolean }): AssignBlockReason | null {
  if (i.member !== "active") return "not_member";
  if (i.burned) return "burned";
  if (i.alreadyHasAccess) return "already_owned";
  if (i.free <= 0) return "no_free";
  return null;
}

export const ASSIGN_BLOCK_MESSAGES: Record<AssignBlockReason, string> = {
  not_member: "Bu kullanıcı şirketin onaylı bir üyesi değil.",
  burned: "Bu kullanıcı için bu eğitimin hakkı yanmış; yeniden verilemez.",
  already_owned: "Bu kullanıcı bu eğitime zaten sahip.",
  no_free: "Bu eğitim için boş kontenjan yok.",
};

/** Bir kullanıcının akış baytı bu eşiği geçince video izlenmiş sayılır (kısa/yanlışlıkla açılan istekler sayılmasın). */
export const WATCH_MIN_BYTES = 512 * 1024;

export const isWatched = (i: { completedLessons: number; streamBytes: number }): boolean => i.completedLessons > 0 || i.streamBytes >= WATCH_MIN_BYTES;

/** Geri alma: izlenmemişse kontenjan havuza döner; izlenmişse onay istenir, onayla yanar. */
export function reclaimOutcome(watched: boolean, confirmBurn: boolean): "return" | "burn" | "needs_confirm" {
  if (!watched) return "return";
  return confirmBurn ? "burn" : "needs_confirm";
}

/** Ana adminin toplamı değiştirmesi: 0 anlamsız; atanan + yanan sayının altına inemez. */
export function allocationBlock(i: { currentTotal: number; assigned: number; burned: number; delta: number }): "zero" | "below_used" | null {
  if (i.delta === 0) return "zero";
  if (i.currentTotal + i.delta < i.assigned + i.burned) return "below_used";
  return null;
}

/** Şirkette `adminCount` admin varken bir admin düşürülebilir/çıkarılabilir mi (son admin kalamaz). */
export const canRemoveAdmin = (adminCount: number): boolean => adminCount >= 2;

export type ProgressStatus = "not_started" | "in_progress" | "completed";

export function progressStatus(i: { completed: number; total: number; certificate: string | null }): ProgressStatus {
  if (i.certificate || (i.total > 0 && i.completed >= i.total)) return "completed";
  return i.completed === 0 ? "not_started" : "in_progress";
}

// ── Kontenjan satın alma ──────────────────────────────────────────────────────
export const seatCheckoutSchema = z.object({
  slug: z.string().min(1).max(120),
  quantity: seatQuantitySchema,
  billing: billingSchema,
  consents: consentsSchema,
  card: cardSchema.optional(),
});
export type SeatCheckoutInput = z.infer<typeof seatCheckoutSchema>;

export const seatOrderTitle = (courseTitle: string, quantity: number): string => `${courseTitle} · ${quantity} kişilik kontenjan`;

import { z } from "zod";

// Kupon kuralları tek yerde: yönetici formu, API'ler ve ödeme aynı fonksiyonları kullanır.

export const COUPON_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

/** Boşlukları atar, büyük harfe çevirir (Türkçe "i" sorunu olmasın diye ASCII büyütme). */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").replace(/ı/g, "i").toUpperCase();
}

const optionalCount = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1, "En az 1 olmalı.").max(1_000_000).nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih biçimi geçersiz.").nullable());

export const couponCreateSchema = z
  .object({
    code: z.string().transform(normalizeCouponCode).refine((c) => COUPON_CODE_RE.test(c), "Kod 3-40 karakter olmalı; yalnızca harf, rakam, - ve _ içerebilir."),
    discount_type: z.enum(["percentage", "fixed"]),
    discount_value: z.coerce.number().positive("İndirim 0'dan büyük olmalı.").max(1_000_000),
    valid_from: optionalDate,
    valid_until: optionalDate,
    max_uses: optionalCount,
    max_uses_per_user: optionalCount,
  })
  .superRefine((c, ctx) => {
    if (c.discount_type === "percentage" && (c.discount_value > 100 || !Number.isInteger(c.discount_value * 100))) {
      ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Yüzde 0-100 arasında olmalı." });
    }
    if (c.discount_type === "fixed" && !Number.isInteger(Math.round(c.discount_value * 100))) {
      ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Tutar geçersiz." });
    }
    if (c.valid_from && c.valid_until && c.valid_until < c.valid_from) {
      ctx.addIssue({ code: "custom", path: ["valid_until"], message: "Bitiş tarihi başlangıçtan önce olamaz." });
    }
  });
export type CouponCreate = z.infer<typeof couponCreateSchema>;

export const couponPatchSchema = z.object({ is_active: z.boolean() });

/**
 * İndirimi hesaplar. percentage: toplamın yüzdesi · fixed: sabit TL. İndirim toplamı aşamaz; kuruş hassasiyetiyle yuvarlanır.
 */
export function computeDiscount(subtotal: number, type: "percentage" | "fixed", value: number): { discount: number; total: number } {
  const sub = Math.max(0, Math.round(subtotal * 100));
  const raw = type === "percentage" ? Math.round((sub * value) / 100) : Math.round(value * 100);
  const discount = Math.min(sub, Math.max(0, raw));
  return { discount: discount / 100, total: (sub - discount) / 100 };
}

/** Okunur özet: "%20" / "₺150". */
export function describeDiscount(type: "percentage" | "fixed", value: number): string {
  return type === "percentage" ? `%${Number(value)}` : `₺${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)}`;
}

/** Yönetici formundaki "rastgele üret" düğmesi için okunaklı kod (0/O, 1/I yok). */
export function generateCouponCode(rand: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "PRF-" + Array.from({ length: 6 }, () => A[rand(A.length)]).join("");
}

/** İndirimi kalemlere orantılı dağıtır (kuruş hassasiyeti; yuvarlama farkı son kaleme gider). Toplam = sum(prices) - discount. */
export function allocateDiscount(prices: number[], discount: number): number[] {
  const cents = prices.map((p) => Math.round(p * 100));
  const sum = cents.reduce((a, b) => a + b, 0);
  const d = Math.min(sum, Math.round(discount * 100));
  if (sum === 0 || d === 0) return prices.slice();
  let left = d;
  const out = cents.map((c, i) => {
    const share = i === cents.length - 1 ? left : Math.min(left, Math.round((c * d) / sum));
    left -= share;
    return (c - share) / 100;
  });
  return out;
}

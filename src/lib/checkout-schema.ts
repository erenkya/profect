import { z } from "zod";

// İstemci formu ve /api/checkout aynı şemayı kullanır (kural tek yerde kalsın).

/** TC Kimlik No algoritması: 11 hane, ilki 0 değil, 10. ve 11. hane sağlama. */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if (((odd * 7 - even) % 10 + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

/** 0 (532) 123 45 67 / +90 532 123 45 67 → 5321234567; geçersizse null. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("90") && digits.length === 12 ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits;
  return /^5\d{9}$/.test(national) ? national : null;
}

const text = (label: string, max: number, min = 2) =>
  z.string({ required_error: `${label} zorunludur.` }).trim().min(min, `${label} zorunludur.`).max(max, `${label} en fazla ${max} karakter olabilir.`);

const common = {
  full_name: text("Ad soyad", 160, 3),
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.").max(190),
  phone: z.string().trim().refine((v) => normalizePhone(v) !== null, "Geçerli bir cep telefonu girin (5XX XXX XX XX)."),
  address: text("Adres", 500, 10),
  city: text("İl", 80),
  district: text("İlçe", 80),
  zip_code: z.string().trim().regex(/^\d{5}$/, "Posta kodu 5 haneli olmalı."),
};

export const billingSchema = z.discriminatedUnion("invoice_type", [
  z.object({
    invoice_type: z.literal("bireysel"),
    ...common,
    tckn: z.string().trim().refine(isValidTckn, "Geçerli bir TC kimlik numarası girin."),
  }),
  z.object({
    invoice_type: z.literal("kurumsal"),
    ...common,
    company_name: text("Şirket unvanı", 200),
    tax_office: text("Vergi dairesi", 120),
    tax_number: z.string().trim().regex(/^\d{10}$/, "Vergi numarası 10 haneli olmalı."),
  }),
]);
export type Billing = z.infer<typeof billingSchema>;

export const CONSENT_KEYS = ["distance_sales", "privacy", "delivery_return", "kvkk"] as const;
export type ConsentKey = (typeof CONSENT_KEYS)[number];

export const consentsSchema = z.object({
  distance_sales: z.literal(true, { errorMap: () => ({ message: "Mesafeli Satış Sözleşmesi'ni kabul etmelisiniz." }) }),
  privacy: z.literal(true, { errorMap: () => ({ message: "Gizlilik ve Güvenlik Sözleşmesi'ni kabul etmelisiniz." }) }),
  delivery_return: z.literal(true, { errorMap: () => ({ message: "Teslimat, İade ve İptal Koşulları'nı kabul etmelisiniz." }) }),
  kvkk: z.literal(true, { errorMap: () => ({ message: "KVKK Aydınlatma Metni'ni kabul etmelisiniz." }) }),
});

export const cartItemsSchema = z
  .array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("course"), slug: z.string().min(1).max(120) }),
      z.object({ type: z.literal("plus") }),
    ]),
  )
  .max(20);

/** Kart bilgisi yalnızca kartlı sağlayıcı (ör. Tami) açıkken gönderilir; hiçbir yerde saklanmaz. */
export const cardSchema = z.object({
  holder_name: text("Kart üzerindeki isim", 120, 3),
  number: z.string().transform((v) => v.replace(/\s+/g, "")).refine((v) => /^\d{15,19}$/.test(v) && luhn(v), "Kart numarası geçersiz."),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Son kullanma tarihi AA/YY biçiminde olmalı."),
  cvv: z.string().regex(/^\d{3,4}$/, "CVC 3 veya 4 haneli olmalı."),
});

export function luhn(num: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export const checkoutSchema = z.object({
  items: cartItemsSchema.min(1, "Sepetiniz boş."),
  billing: billingSchema,
  consents: consentsSchema,
  card: cardSchema.optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

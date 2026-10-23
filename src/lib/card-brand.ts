// Kart ağını (Visa / Mastercard / Amex / Troy) numaranın ilk hanelerinden (BIN) tahmin eder. Yalnızca gösterim içindir;
// doğrulama ve tahsilat bankada/ödeme kuruluşunda yapılır.
export type CardBrand = "visa" | "mastercard" | "amex" | "troy";

export const CARD_BRAND_LABEL: Record<CardBrand, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", troy: "Troy" };

/** public/images/payment/card-*.svg (card-logos-band.svg'den kırpıldı); w/h = 22 px yükseklikte yaklaşık görüntü boyutu. */
export const CARD_BRAND_ICON: Record<CardBrand, { src: string; w: number; h: number }> = {
  visa: { src: "/images/payment/card-visa.svg", w: 50, h: 17 },
  mastercard: { src: "/images/payment/card-mastercard.svg", w: 30, h: 23 },
  amex: { src: "/images/payment/card-amex.svg", w: 33, h: 22 },
  troy: { src: "/images/payment/card-troy.svg", w: 52, h: 22 },
};

export function detectCardBrand(number: string): CardBrand | null {
  const d = number.replace(/\D/g, "");
  if (/^9792/.test(d)) return "troy";
  if (/^3[47]/.test(d)) return "amex";
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]|7[01]|720))/.test(d)) return "mastercard";
  return null;
}

/** Amex 15 hane (4-6-5), Visa/Mastercard/Troy 16 hane, tanınmayan kartlar en çok 19 hane (4'lü gruplar). */
export function formatCardNumber(value: string): string {
  const all = value.replace(/\D/g, "");
  const brand = detectCardBrand(all);
  if (brand === "amex") {
    const x = all.slice(0, 15);
    return [x.slice(0, 4), x.slice(4, 10), x.slice(10)].filter(Boolean).join(" ");
  }
  return all.slice(0, brand ? 16 : 19).replace(/(.{4})/g, "$1 ").trim();
}

/** CVC uzunluğu: Amex 4, diğerleri 3. */
export const cvcLength = (brand: CardBrand | null) => (brand === "amex" ? 4 : 3);

/**
 * "Son kullanma" girişini yazarken düzeltir: ay 01-12 dışına çıkamaz (1'den büyük ilk rakam otomatik 0'lanır:
 * 5 → 05, 13 ve 00 reddedilir), yıl 2 hane, biçim AA/YY.
 */
export function formatExpiry(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.length >= 1 && d[0] > "1") d = "0" + d;
  d = d.slice(0, 4);
  if (d.length >= 2) {
    const month = Number(d.slice(0, 2));
    if (month < 1 || month > 12) d = d.slice(0, 1);
  }
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** AA/YY geçerli bir ay mı ve kartın süresi dolmamış (bu ay dahil) ve en çok 20 yıl ilerde mi? */
export function isValidExpiry(value: string, now: Date = new Date()): boolean {
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(value);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  const ny = now.getFullYear();
  const nm = now.getMonth() + 1;
  if (year < ny || (year === ny && month < nm)) return false;
  return year <= ny + 20;
}

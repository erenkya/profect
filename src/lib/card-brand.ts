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

/** Amex 4-6-5, diğerleri 4'lü gruplar. */
export function formatCardNumber(value: string): string {
  const d = value.replace(/\D/g, "");
  if (detectCardBrand(d) === "amex") {
    const x = d.slice(0, 15);
    return [x.slice(0, 4), x.slice(4, 10), x.slice(10)].filter(Boolean).join(" ");
  }
  return d.slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
}

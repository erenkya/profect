// KDV tek yerde: sepet/ödeme ekranı, sunucudaki tahsilat ve makbuz aynı fonksiyonları kullanır.
// Katalog ve sipariş kalemi fiyatları KDV HARİÇ'tir; `orders.amount` (tahsil edilen tutar) KDV DAHİL'dir.

/** Eğitim hizmeti için genel KDV oranı (yüzde). Oran değişirse yalnızca burası güncellenir. */
export const VAT_PERCENT = 20;

const cents = (n: number) => Math.round(n * 100);

/** KDV hariç tutardan KDV'yi ve KDV dahil tutarı kuruş hassasiyetiyle hesaplar. */
export function withVat(net: number): { net: number; vat: number; gross: number } {
  const n = Math.max(0, cents(net));
  const vat = Math.round((n * VAT_PERCENT) / 100);
  return { net: n / 100, vat: vat / 100, gross: (n + vat) / 100 };
}

/**
 * KDV hariç kalem fiyatlarını KDV dahil fiyatlara çevirir; yuvarlama farkı son kaleme gider, böylece toplam her zaman
 * `withVat(sum(nets)).gross` olur (Tami sepet toplamı tahsil edilen tutara eşit olmalı).
 */
export function allocateVat(nets: number[]): number[] {
  const c = nets.map(cents);
  const grossTotal = cents(withVat(c.reduce((a, b) => a + b, 0) / 100).gross);
  let left = grossTotal;
  return c.map((x, i) => {
    const g = i === c.length - 1 ? left : Math.round((x * (100 + VAT_PERCENT)) / 100);
    left -= g;
    return g / 100;
  });
}

/**
 * Siparişe dahil KDV: tahsil edilen tutar − (kalemler toplamı − indirim). KDV öncesi oluşturulmuş eski siparişlerde
 * tutar zaten kalemlerin net toplamına eşit olduğundan 0 döner.
 */
export function orderVat(amount: number, itemsTotal: number, discount: number): number {
  return Math.max(0, cents(amount) - (cents(itemsTotal) - cents(discount))) / 100;
}

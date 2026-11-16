import "server-only";

// Ödeme sağlayıcısı iade arayüzü. Sağlayıcı `orders.provider` ile seçilir (bkz. payment/index.ts):
//   manual → para banka havalesiyle elle iade edilir; admin panelde "İade yapıldı" der (manual_pending)
//   mock   → yalnızca geliştirme/demo: iade anında tamamlanır
//   tami   → Tami Sanal POS iadesi. HENÜZ YAZILMADI: POS erişimi gelince burası doldurulur.

export type RefundOutcome = { kind: "done"; providerRef: string } | { kind: "manual_pending" } | { kind: "failed"; message: string };

/**
 * Siparişin parasını iade eder. `requestId` (refund_requests.id) sağlayıcıya idempotency anahtarı olarak gider:
 * aynı başvuru için çağrı tekrarlanırsa sağlayıcı ikinci kez iade etmemeli.
 */
export async function refundOrder(order: { id: number; provider: string; amount: number; provider_ref: string | null }, requestId: number): Promise<RefundOutcome> {
  switch (order.provider) {
    case "manual":
      return { kind: "manual_pending" };
    case "mock":
      return { kind: "done", providerRef: `mock-refund-${requestId}` };
    case "tami":
      // TODO(POS): Tami iade/iptal çağrısı. İşlem günü içindeyse iptal (void), değilse iade; hangisi Tami dokümanına göre belirlenir.
      // `XellenceWeb/lib/tami-pos.ts` (bkz. tami.ts başlığı) iade içeriyorsa oradan uyarlanır; `tami.ts`'teki `call` ve imza yardımcıları kullanılır.
      // order.provider_ref Tami'deki sipariş referansıdır; idempotency anahtarı olarak `requestId` gönderilir.
      return { kind: "failed", message: "Tami iadesi henüz yapılandırılmadı." };
    default:
      return { kind: "failed", message: `Bilinmeyen ödeme sağlayıcısı: ${order.provider}` };
  }
}

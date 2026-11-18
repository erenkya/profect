import "server-only";
import { refundPayment } from "@/lib/payment/tami";

// Ödeme sağlayıcısı iade arayüzü. Sağlayıcı `orders.provider` ile seçilir (bkz. payment/index.ts):
//   manual → para banka havalesiyle elle iade edilir; admin panelde "İade yapıldı" der (manual_pending)
//   mock   → yalnızca geliştirme/demo: iade anında tamamlanır
//   tami   → Tami Sanal POS: tek çağrı (/payment/refund); gün sonundan önce banka iptal, sonra iade olarak işler

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
    case "tami": {
      if (!order.provider_ref) return { kind: "failed", message: "Siparişin Tami referansı yok." };
      try {
        const r = await refundPayment({ orderId: order.provider_ref, amount: order.amount, reason: `İade başvurusu #${requestId}` });
        if (!r.success) return { kind: "failed", message: r.errorMessage || "Tami iadeyi reddetti." };
        return { kind: "done", providerRef: r.bankReferenceNumber || r.bankAuthCode || `tami-refund-${requestId}` };
      } catch (err) {
        // Yanıt alınamadı: iade bankada gerçekleşmiş olabilir. Yeniden denemeden önce Tami panelinden siparişe bakılmalı.
        console.error("[tami-refund] çağrı başarısız", { requestId, orderId: order.id }, err);
        const why = err instanceof Error ? err.message : String(err);
        return { kind: "failed", message: `Tami'ye ulaşılamadı (${why}); yeniden denemeden önce Tami panelinde siparişin durumunu kontrol edin.` };
      }
    }
    default:
      return { kind: "failed", message: `Bilinmeyen ödeme sağlayıcısı: ${order.provider}` };
  }
}

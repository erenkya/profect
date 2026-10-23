import "server-only";
import { tamiConfigured } from "./tami";

/**
 * Ödeme sağlayıcısı seçimi (PAYMENT_PROVIDER, eski ad PAYMENT_MODE):
 *   manual (varsayılan) → para alınmaz; sipariş "pending" kalır, admin panelinden onaylanır
 *   mock                → yalnızca geliştirme/demo: sipariş anında "ödendi" sayılır
 *   tami                → Tami Sanal POS (3D Secure). TAMI_* env değerleri eksikse manual'e düşer.
 */
export type PaymentProviderId = "manual" | "mock" | "tami";

export function paymentProvider(): { id: PaymentProviderId; requiresCard: boolean } {
  const wanted = process.env.PAYMENT_PROVIDER ?? process.env.PAYMENT_MODE;
  if (wanted === "mock") return { id: "mock", requiresCard: false };
  if (wanted === "tami") {
    if (tamiConfigured()) return { id: "tami", requiresCard: true };
    console.error("PAYMENT_PROVIDER=tami ama TAMI_* env değerleri eksik; manual moda düşüldü.");
  }
  return { id: "manual", requiresCard: false };
}

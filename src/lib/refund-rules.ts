// İade sürecinin saf (DB/ağ içermeyen) kuralları: uygunluk, aşılabilir engeller, durum geçişleri.
// `server-only` içermez; node --test ile doğrudan yüklenebilir.

/** Ödeme tarihinden itibaren iade başvurusu yapılabilen gün sayısı (yasal metinle aynı). */
export const REFUND_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RefundBlockReason =
  | "not_paid"
  | "free_order"
  | "window_expired"
  | "already_started"
  | "gift_claimed"
  | "seats_assigned"
  | "request_exists";

export type RefundFacts = {
  status: "pending" | "paid" | "rejected" | "refunded";
  amount: number;
  /** Ödeme tarihi; boş `paid_at` olan eski siparişlerde çağıran taraf `created_at`'e düşer. */
  paidAt: Date | null;
  /** Satın alımdan sonra kurs/program başlanmış mı (`isWatched` kuralı). */
  started: boolean;
  giftClaimed: boolean;
  /** Kontenjan siparişi: iade kontenjan toplamını atanan+yanan sayının altına indirir mi. */
  seatsWouldUndercut: boolean;
  hasRequest: boolean;
};

export type RefundVerdict = { eligible: boolean; reasons: RefundBlockReason[] };

/** Ödeme anından 14. günün sonuna dek (sınır dahil) iade penceresi açıktır. */
export function withinRefundWindow(paidAt: Date | null, now: Date): boolean {
  if (!paidAt) return false;
  return now.getTime() - paidAt.getTime() <= REFUND_WINDOW_DAYS * DAY_MS;
}

export function evaluateRefund(f: RefundFacts, now: Date): RefundVerdict {
  const reasons: RefundBlockReason[] = [];
  if (f.status !== "paid") reasons.push("not_paid");
  if (f.amount <= 0) reasons.push("free_order");
  // Ödenmemiş siparişte pencere anlamsızdır: yalnızca `not_paid` raporlanır.
  if (f.status === "paid" && !withinRefundWindow(f.paidAt, now)) reasons.push("window_expired");
  if (f.started) reasons.push("already_started");
  if (f.giftClaimed) reasons.push("gift_claimed");
  if (f.seatsWouldUndercut) reasons.push("seats_assigned");
  if (f.hasRequest) reasons.push("request_exists");
  return { eligible: reasons.length === 0, reasons };
}

/** Admin yalnızca bu engelleri (gerekçe notuyla) aşabilir; diğerleri sistem tutarlılığı içindir. */
const OVERRIDABLE: ReadonlySet<RefundBlockReason> = new Set(["already_started", "window_expired"]);

export const canOverride = (reasons: RefundBlockReason[]): boolean => reasons.length > 0 && reasons.every((r) => OVERRIDABLE.has(r));

/** Kullanıcıya gösterilen tek satırlık Türkçe neden metinleri. */
export const REFUND_REASON_TEXT: Record<RefundBlockReason, string> = {
  not_paid: "Bu sipariş için ödeme alınmadığından iade yapılamaz.",
  free_order: "Ücretsiz siparişler için iade yapılamaz.",
  window_expired: `Ödemeden bu yana ${REFUND_WINDOW_DAYS} günden fazla geçtiği için iade yapılamaz.`,
  already_started: "Kursa başlandığı için iade yapılamaz.",
  gift_claimed: "Hediye alıcı tarafından alındığı için iade yapılamaz.",
  seats_assigned: "Kontenjanın bir kısmı çalışanlara atandığı için iade yapılamaz. Lütfen bizimle iletişime geçin.",
  request_exists: "Bu sipariş için zaten bir iade başvurusu var.",
};

export type RefundStatus = "requested" | "approved" | "refunded" | "rejected" | "failed";

const TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["refunded", "failed"],
  failed: ["approved", "rejected"],
  refunded: [],
  rejected: [],
};

export const canTransition = (from: RefundStatus, to: RefundStatus): boolean => TRANSITIONS[from].includes(to);

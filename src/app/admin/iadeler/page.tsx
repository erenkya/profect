import type { RowDataPacket } from "mysql2";
import { RefundsTable, type RefundRow } from "@/components/admin/RefundsTable";
import pool from "@/lib/db";
import { ORDER_ITEMS_SUMMARY_SQL } from "@/lib/lms";
import { loadRefundFacts } from "@/lib/refund";
import { evaluateRefund } from "@/lib/refund-rules";

export const metadata = { title: "İadeler" };

export default async function AdminRefunds() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.id, r.order_id, r.status, r.amount, r.reason, r.decision_note, r.error_message, r.created_at, r.provider,
            COALESCE(o.paid_at, o.created_at) AS paid_at, TIMESTAMPDIFF(DAY, COALESCE(o.paid_at, o.created_at), NOW()) AS paid_days,
            ${ORDER_ITEMS_SUMMARY_SQL} AS items_summary, u.full_name AS user_name, u.email AS user_email
       FROM refund_requests r JOIN orders o ON o.id = r.order_id JOIN users u ON u.id = r.user_id
      ORDER BY FIELD(r.status, 'requested', 'failed', 'approved', 'refunded', 'rejected'), r.created_at DESC LIMIT 300`,
  );
  // Uygunluk her açık başvuru için karar anındaki durumla yeniden hesaplanır (başvurudan sonra kullanıcı başlamış olabilir).
  const now = new Date();
  const refunds: RefundRow[] = await Promise.all(
    rows.map(async (r) => {
      const open = r.status === "requested" || r.status === "failed";
      const loaded = open ? await loadRefundFacts(pool, r.order_id, r.id) : null;
      return { ...r, amount: String(r.amount), blocks: loaded ? evaluateRefund(loaded.facts, now).reasons : [] } as RefundRow;
    }),
  );
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 12px" }}>İadeler</h1>
      <p style={{ color: "var(--muted-72)", marginBottom: 24 }}>Kullanıcıların sipariş sayfasından yaptığı iade talepleri. Onay erişimi hemen geri alır; elle ödemede banka iadesini yaptıktan sonra “İade yapıldı” de.</p>
      <RefundsTable refunds={refunds} />
    </>
  );
}

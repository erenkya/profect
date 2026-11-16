import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { isWatched } from "@/lib/company-rules";
import {
  REFUND_WINDOW_DAYS,
  evaluateRefund,
  type RefundBlockReason,
  type RefundFacts,
  type RefundStatus,
} from "@/lib/refund-rules";

export type Queryable = Pick<PoolConnection, "query" | "execute">;

type OrderItemRow = { item_type: string; course_id: number | null; program_id: number | null; quantity: number | null };

/**
 * Kullanıcı bu kursta satın alımdan SONRA başlamış mı: ödemeden bu yana tamamlanmış ders ya da eşik üstü video akışı (`isWatched`).
 * Karşılaştırma DB saatiyle yapılır (`paidAgeSeconds` = ödemeden bu yana geçen saniye): Node ile DB saat dilimi farkı sonucu kaydırmaz.
 * Satın almadan önce ücretsiz önizlemede izlenen ders sayılmaz.
 */
export async function hasStartedSince(conn: Queryable, userId: number, courseId: number, paidAgeSeconds: number): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
              WHERE lp.user_id = ? AND m.course_id = ? AND lp.completed_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)) AS completed,
            (SELECT COALESCE(SUM(u.bytes), 0) FROM video_stream_usage u JOIN lessons l ON l.id = u.lesson_id JOIN modules m ON m.id = l.module_id
              WHERE u.user_id = ? AND m.course_id = ? AND u.day >= DATE(DATE_SUB(NOW(), INTERVAL ? SECOND))) AS bytes`,
    [userId, courseId, paidAgeSeconds, userId, courseId, paidAgeSeconds],
  );
  return isWatched({ completedLessons: Number(rows[0].completed), streamBytes: Number(rows[0].bytes) });
}

export type RefundOrder = { id: number; user_id: number; company_id: number | null; amount: number; provider: string; status: RefundFacts["status"] };

/**
 * Siparişin uygunluk girdileri. Çağıran, karar anında sipariş satırını kendi transaction'ında `FOR UPDATE` kilitlemiş olmalı.
 * `excludeRequestId`: kararı verilen başvurunun kendisi `request_exists` sayılmasın.
 */
export async function loadRefundFacts(conn: Queryable, orderId: number, excludeRequestId?: number): Promise<{ order: RefundOrder; facts: RefundFacts } | null> {
  const [orows] = await conn.query<RowDataPacket[]>(
    `SELECT id, user_id, company_id, course_id, amount, provider, status,
            TIMESTAMPDIFF(SECOND, COALESCE(paid_at, created_at), NOW()) AS age_seconds
       FROM orders WHERE id = ?`,
    [orderId],
  );
  const o = orows[0];
  if (!o) return null;
  const order: RefundOrder = { id: o.id, user_id: o.user_id, company_id: o.company_id, amount: Number(o.amount), provider: o.provider, status: o.status };
  const ageSeconds = Number(o.age_seconds);

  const [irows] = await conn.query<RowDataPacket[]>("SELECT item_type, course_id, program_id, quantity FROM order_items WHERE order_id = ?", [orderId]);
  // Eski (tek kalemli) siparişlerde kalem satırı yoktur: `orders.course_id`'den türetilir (`fulfillOrder` ile aynı).
  const items: OrderItemRow[] = irows.length ? (irows as OrderItemRow[]) : o.course_id ? [{ item_type: "course", course_id: o.course_id, program_id: null, quantity: 1 }] : [];

  const courseIds = new Set<number>();
  for (const it of items) {
    if (it.item_type === "course" && it.course_id) courseIds.add(Number(it.course_id));
    if (it.item_type === "program" && it.program_id) {
      const [pc] = await conn.query<RowDataPacket[]>("SELECT course_id FROM program_courses WHERE program_id = ?", [it.program_id]);
      for (const r of pc) courseIds.add(Number(r.course_id));
    }
  }
  let started = false;
  for (const courseId of courseIds) {
    if (await hasStartedSince(conn, order.user_id, courseId, ageSeconds)) {
      started = true;
      break;
    }
  }

  const [grows] = await conn.query<RowDataPacket[]>("SELECT 1 FROM gifts WHERE order_id = ? AND status = 'claimed' LIMIT 1", [orderId]);

  // Kontenjan siparişi: iade, şirketin toplamını atanan+yanan sayının altına indiriyorsa uygun değildir.
  let seatsWouldUndercut = false;
  for (const it of items) {
    if (!o.company_id) break;
    const programSeats = it.item_type === "program_seats";
    if (!programSeats && it.item_type !== "seats") continue;
    const [alloc] = await conn.query<RowDataPacket[]>(
      programSeats ? "SELECT quantity FROM company_program_allocations WHERE order_id = ?" : "SELECT quantity FROM company_allocations WHERE order_id = ?",
      [orderId],
    );
    if (!alloc[0]) continue;
    const [counts] = await conn.query<RowDataPacket[]>(
      programSeats
        ? `SELECT COALESCE((SELECT SUM(quantity) FROM company_program_allocations WHERE company_id = ? AND program_id = ?), 0) AS total,
                  (SELECT COUNT(*) FROM company_program_assignments WHERE company_id = ? AND program_id = ? AND status IN ('active','burned')) AS used`
        : `SELECT COALESCE((SELECT SUM(quantity) FROM company_allocations WHERE company_id = ? AND course_id = ?), 0) AS total,
                  (SELECT COUNT(*) FROM company_assignments WHERE company_id = ? AND course_id = ? AND status IN ('active','burned')) AS used`,
      [o.company_id, programSeats ? it.program_id : it.course_id, o.company_id, programSeats ? it.program_id : it.course_id],
    );
    if (Number(counts[0].total) - Number(alloc[0].quantity) < Number(counts[0].used)) seatsWouldUndercut = true;
  }

  const [rrows] = await conn.query<RowDataPacket[]>("SELECT 1 FROM refund_requests WHERE order_id = ? AND id <> ? LIMIT 1", [orderId, excludeRequestId ?? 0]);

  return {
    order,
    facts: {
      status: order.status,
      amount: order.amount,
      paidAt: new Date(Date.now() - ageSeconds * 1000),
      started,
      giftClaimed: grows.length > 0,
      seatsWouldUndercut,
      hasRequest: rrows.length > 0,
    },
  };
}

export type RefundView = {
  eligible: boolean;
  reasons: RefundBlockReason[];
  windowEndsAt: string | null;
  request: { id: number; status: RefundStatus; reason: string | null; decisionNote: string | null; createdAt: string } | null;
};

/** Sipariş sayfasındaki iade bölümü için görünüm. Sipariş kullanıcıya ait değilse `null`. */
export async function getRefundView(userId: number, orderId: number): Promise<RefundView | null> {
  const [own] = await pool.query<RowDataPacket[]>("SELECT id FROM orders WHERE id = ? AND user_id = ?", [orderId, userId]);
  if (!own[0]) return null;
  const loaded = await loadRefundFacts(pool, orderId);
  if (!loaded) return null;
  const verdict = evaluateRefund(loaded.facts, new Date());
  const [rr] = await pool.query<RowDataPacket[]>("SELECT id, status, reason, decision_note, created_at FROM refund_requests WHERE order_id = ?", [orderId]);
  const r = rr[0];
  return {
    eligible: verdict.eligible,
    reasons: verdict.reasons,
    windowEndsAt: loaded.facts.paidAt ? new Date(loaded.facts.paidAt.getTime() + REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString() : null,
    request: r ? { id: r.id, status: r.status, reason: r.reason, decisionNote: r.decision_note, createdAt: new Date(r.created_at).toISOString() } : null,
  };
}

export type CreateRefundResult =
  | { ok: true; requestId: number }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "ineligible"; blocks: RefundBlockReason[] };

/** Uygunluk sunucuda, sipariş satırı kilitliyken yeniden hesaplanır (istemci uygunluğuna güvenilmez). */
export async function createRefundRequest(i: { userId: number; orderId: number; reason: string | null }): Promise<CreateRefundResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [own] = await conn.query<RowDataPacket[]>("SELECT id FROM orders WHERE id = ? AND user_id = ? FOR UPDATE", [i.orderId, i.userId]);
    if (!own[0]) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    const loaded = await loadRefundFacts(conn, i.orderId);
    if (!loaded) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    const verdict = evaluateRefund(loaded.facts, new Date());
    if (!verdict.eligible) {
      await conn.rollback();
      return { ok: false, reason: "ineligible", blocks: verdict.reasons };
    }
    const snapshot = JSON.stringify({ reasons: verdict.reasons, evaluatedAt: new Date().toISOString(), amount: loaded.order.amount });
    const [res] = await conn.execute<ResultSetHeader>(
      "INSERT INTO refund_requests (order_id, user_id, amount, status, reason, eligibility_json, provider) VALUES (?, ?, ?, 'requested', ?, ?, ?)",
      [i.orderId, i.userId, loaded.order.amount, i.reason, snapshot, loaded.order.provider],
    );
    await conn.commit();
    return { ok: true, requestId: res.insertId };
  } catch (err) {
    await conn.rollback();
    // UNIQUE(order_id): kilit altında bile eş zamanlı ikinci başvuru bu hatayla düşer.
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") return { ok: false, reason: "ineligible", blocks: ["request_exists"] };
    throw err;
  } finally {
    conn.release();
  }
}

/** Yeni iade talebinde admine bildirim (Task 7'de doldurulur). */
export async function notifyRefundRequested(_requestId: number, _baseUrl: string): Promise<void> {}

import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { lockCompany } from "@/lib/company-lock";
import { isWatched } from "@/lib/company-rules";
import { sendRefundDecisionEmail, sendRefundRequestNoticeEmail } from "@/lib/mail";
import { applyRefundEffects } from "@/lib/refund-effects";
import { refundOrder } from "@/lib/payment/refund";
import {
  REFUND_WINDOW_DAYS,
  canOverride,
  canTransition,
  evaluateRefund,
  isAutomaticProvider,
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

export type RefundOrder = { id: number; user_id: number; company_id: number | null; amount: number; provider: string; provider_ref: string | null; status: RefundFacts["status"] };

/**
 * Siparişin uygunluk girdileri. Çağıran, karar anında sipariş satırını kendi transaction'ında `FOR UPDATE` kilitlemiş olmalı.
 * `excludeRequestId`: kararı verilen başvurunun kendisi `request_exists` sayılmasın.
 */
export async function loadRefundFacts(conn: Queryable, orderId: number, excludeRequestId?: number): Promise<{ order: RefundOrder; facts: RefundFacts } | null> {
  const [orows] = await conn.query<RowDataPacket[]>(
    `SELECT id, user_id, company_id, course_id, amount, provider, provider_ref, status,
            TIMESTAMPDIFF(SECOND, COALESCE(paid_at, created_at), NOW()) AS age_seconds
       FROM orders WHERE id = ?`,
    [orderId],
  );
  const o = orows[0];
  if (!o) return null;
  const order: RefundOrder = { id: o.id, user_id: o.user_id, company_id: o.company_id, amount: Number(o.amount), provider: o.provider, provider_ref: o.provider_ref ?? null, status: o.status };
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

type NotifyRow = { order_id: number; amount: string; reason: string | null; decision_note: string | null; user_name: string; user_email: string; order_email: string | null; full_name: string | null };

async function loadNotifyRow(requestId: number): Promise<NotifyRow | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.order_id, r.amount, r.reason, r.decision_note, u.full_name AS user_name, u.email AS user_email, o.email AS order_email, o.full_name
       FROM refund_requests r JOIN orders o ON o.id = r.order_id JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
    [requestId],
  );
  return rows[0] as NotifyRow | undefined;
}

/** Yeni iade talebinde admine bildirim. Başarısız olsa da başvuru geçerlidir; hata yalnızca loglanır (`order-notify.ts` gibi). */
export async function notifyRefundRequested(requestId: number, baseUrl: string): Promise<void> {
  try {
    const r = await loadNotifyRow(requestId);
    if (!r) return;
    await sendRefundRequestNoticeEmail({ orderNo: r.order_id, customerName: r.full_name ?? r.user_name, amount: Number(r.amount), reason: r.reason, adminUrl: `${baseUrl}/admin/iadeler` });
  } catch (err) {
    console.error(`[refund-notify] #${requestId} talep bildirimi gönderilemedi:`, err);
  }
}

/** İade kararında (iade edildi / reddedildi) kullanıcıya bildirim. Hata yalnızca loglanır. */
export async function notifyRefundDecision(requestId: number, outcome: "refunded" | "rejected", baseUrl: string): Promise<void> {
  try {
    const r = await loadNotifyRow(requestId);
    if (!r) return;
    await sendRefundDecisionEmail({ to: r.order_email ?? r.user_email, orderNo: r.order_id, outcome, amount: Number(r.amount), note: r.decision_note, url: `${baseUrl}/hesabim/siparislerim/${r.order_id}` });
  } catch (err) {
    console.error(`[refund-notify] #${requestId} karar bildirimi gönderilemedi:`, err);
  }
}

// ── Karar akışı ──────────────────────────────────────────────────────────────

export type DecideAction = "approve" | "reject" | "mark_refunded";
export type DecideResult =
  | { ok: true; status: RefundStatus }
  | { ok: false; reason: "not_found" | "bad_state" | "note_required" }
  | { ok: false; reason: "ineligible"; blocks: RefundBlockReason[] };

type RequestRow = { id: number; order_id: number; status: RefundStatus; provider_ref: string | null };

/**
 * Başvuru + siparişi kilitler. Kilit sırası HER YERDE aynı: önce sipariş, sonra başvuru (karşılıklı kilitlenme olmasın).
 * Başvuru yoksa null.
 */
async function lockRequest(conn: PoolConnection, requestId: number): Promise<RequestRow | null> {
  const [first] = await conn.query<RowDataPacket[]>("SELECT order_id FROM refund_requests WHERE id = ?", [requestId]);
  if (!first[0]) return null;
  await conn.query("SELECT id FROM orders WHERE id = ? FOR UPDATE", [first[0].order_id]);
  const [rows] = await conn.query<RowDataPacket[]>("SELECT id, order_id, status, provider_ref FROM refund_requests WHERE id = ? FOR UPDATE", [requestId]);
  return (rows[0] as RequestRow | undefined) ?? null;
}

export async function decideRefund(i: { requestId: number; adminId: number; action: DecideAction; note?: string; override?: boolean }): Promise<DecideResult> {
  if (i.action === "reject") return rejectRefund(i.requestId, i.adminId, i.note);
  if (i.action === "mark_refunded") return markRefunded(i.requestId);
  return approveRefund(i);
}

async function rejectRefund(requestId: number, adminId: number, note?: string): Promise<DecideResult> {
  if (!note?.trim()) return { ok: false, reason: "note_required" };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rr = await lockRequest(conn, requestId);
    if (!rr) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (!canTransition(rr.status, "rejected")) {
      await conn.rollback();
      return { ok: false, reason: "bad_state" };
    }
    const [res] = await conn.execute<ResultSetHeader>(
      "UPDATE refund_requests SET status = 'rejected', decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ? AND status IN ('requested','failed')",
      [adminId, note.trim(), requestId],
    );
    if (res.affectedRows === 0) {
      await conn.rollback();
      return { ok: false, reason: "bad_state" };
    }
    await conn.commit();
    return { ok: true, status: "rejected" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function approveRefund(i: { requestId: number; adminId: number; note?: string; override?: boolean }): Promise<DecideResult> {
  const conn = await pool.getConnection();
  let order: RefundOrder;
  let providerRef: string | null;
  try {
    await conn.beginTransaction();
    const rr = await lockRequest(conn, i.requestId);
    if (!rr) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    const loaded = await loadRefundFacts(conn, rr.order_id, i.requestId);
    if (!loaded) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    // `approved` yeniden girilebilir YALNIZCA sağlayıcı çağrısı zaten başarılıysa (provider_ref dolu): kurtarma yalnızca sonuçlandırır.
    // provider_ref boşken ikinci istek ya çağrı sürüyor ya da yarım kalmış demektir; sağlayıcıyı yeniden çağırmak çift iade riskidir.
    const reentry = rr.status === "approved" && isAutomaticProvider(loaded.order.provider) && rr.provider_ref !== null;
    if (!reentry && !canTransition(rr.status, "approved")) {
      await conn.rollback();
      return { ok: false, reason: "bad_state" };
    }
    const blocks = evaluateRefund(loaded.facts, new Date()).reasons;
    // Yeniden girişte uygunluk yeniden sorulmaz: onay ve (varsa) sağlayıcı çağrısı zaten verildi.
    if (!reentry && blocks.length > 0) {
      if (!(i.override && canOverride(blocks))) {
        await conn.rollback();
        return { ok: false, reason: "ineligible", blocks };
      }
      if (!i.note?.trim()) {
        await conn.rollback();
        return { ok: false, reason: "note_required" };
      }
    }
    if (!reentry) {
      const [res] = await conn.execute<ResultSetHeader>(
        `UPDATE refund_requests SET status = 'approved', decided_by = ?, decided_at = NOW(), override = ?, decision_note = COALESCE(?, decision_note), error_message = NULL
          WHERE id = ? AND status IN ('requested','failed')`,
        [i.adminId, blocks.length > 0 ? 1 : 0, i.note?.trim() || null, i.requestId],
      );
      if (res.affectedRows === 0) {
        await conn.rollback();
        return { ok: false, reason: "bad_state" };
      }
    }
    await conn.commit();
    order = loaded.order;
    providerRef = rr.provider_ref;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Sağlayıcı çağrısı kilidin DIŞINDA (uzun ağ çağrısı bağlantı tutmasın). Çağrı daha önce başarılıysa (provider_ref dolu) tekrarlanmaz.
  if (providerRef === null) {
    const out = await refundOrder({ id: order.id, provider: order.provider, amount: order.amount, provider_ref: order.provider_ref }, i.requestId);
    if (out.kind === "manual_pending") return { ok: true, status: "approved" };
    if (out.kind === "failed") {
      await pool.execute("UPDATE refund_requests SET status = 'failed', error_message = ? WHERE id = ? AND status = 'approved'", [out.message.slice(0, 255), i.requestId]);
      return { ok: true, status: "failed" };
    }
    providerRef = out.providerRef;
    // Çağrıdan hemen sonra yazılır: sonuçlandırma düşse bile yeniden deneme çağrıyı tekrarlamaz.
    await pool.execute("UPDATE refund_requests SET provider_ref = ? WHERE id = ? AND status = 'approved'", [providerRef, i.requestId]);
  }
  return finalizeRefund(i.requestId, providerRef);
}

async function markRefunded(requestId: number): Promise<DecideResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rr = await lockRequest(conn, requestId);
    if (!rr) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    const [o] = await conn.query<RowDataPacket[]>("SELECT provider FROM orders WHERE id = ?", [rr.order_id]);
    // Yalnızca elle ödemede: otomatik sağlayıcı parayı kendisi iade eder.
    if (rr.status !== "approved" || !o[0] || isAutomaticProvider(o[0].provider)) {
      await conn.rollback();
      return { ok: false, reason: "bad_state" };
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return finalizeRefund(requestId, null);
}

/**
 * İadeyi sonuçlandırır (tek transaction): başvuru `refunded`, sipariş `refunded`, yan etkiler geri alınır.
 * Koşullu UPDATE'ler çift sonuçlandırmayı engeller: kaybeden `bad_state` alır.
 */
async function finalizeRefund(requestId: number, providerRef: string | null): Promise<DecideResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rr = await lockRequest(conn, requestId);
    if (!rr || rr.status !== "approved") {
      await conn.rollback();
      return { ok: false, reason: rr ? "bad_state" : "not_found" };
    }
    // Onay ile sonuçlanma arası günler sürebilir (elle ödeme): aşılamaz engeller KİLİT ALTINDA yeniden bakılır.
    // Kilit sırası orders → refund_requests → companies (applyRefundEffects ile aynı).
    const [co] = await conn.query<RowDataPacket[]>("SELECT company_id FROM orders WHERE id = ?", [rr.order_id]);
    if (co[0]?.company_id) await lockCompany(conn, co[0].company_id);
    const recheck = await loadRefundFacts(conn, rr.order_id, requestId);
    const late: RefundBlockReason[] = [];
    if (recheck?.facts.giftClaimed) late.push("gift_claimed");
    if (recheck?.facts.seatsWouldUndercut) late.push("seats_assigned");
    if (late.length > 0) {
      await conn.rollback();
      return { ok: false, reason: "ineligible", blocks: late };
    }
    const [res] = await conn.execute<ResultSetHeader>(
      "UPDATE refund_requests SET status = 'refunded', refunded_at = NOW(), provider_ref = COALESCE(?, provider_ref) WHERE id = ? AND status = 'approved'",
      [providerRef, requestId],
    );
    const [ores] = await conn.execute<ResultSetHeader>("UPDATE orders SET status = 'refunded', refunded_at = NOW() WHERE id = ? AND status = 'paid'", [rr.order_id]);
    if (res.affectedRows === 0 || ores.affectedRows === 0) {
      await conn.rollback();
      return { ok: false, reason: "bad_state" };
    }
    const [orows] = await conn.query<RowDataPacket[]>("SELECT id, user_id, company_id FROM orders WHERE id = ?", [rr.order_id]);
    await applyRefundEffects(conn, orows[0] as { id: number; user_id: number; company_id: number | null });
    await conn.commit();
    return { ok: true, status: "refunded" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

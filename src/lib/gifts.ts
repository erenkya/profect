import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import type { Billing } from "@/lib/checkout-schema";
import { formatDate } from "@/lib/format";
import {
  GIFT_MAX_SENDS_PER_WINDOW,
  GIFT_RESEND_COOLDOWN_SECONDS,
  GIFT_SEND_WINDOW_MINUTES,
  GIFT_TTL_DAYS,
  claimBlock,
  isGiftToken,
  normalizeRecipientEmail,
  type GiftClaimReason,
  type GiftKind,
  type GiftStatus,
} from "@/lib/gift-rules";
import { sendGiftRecipientEmail, sendGiftSenderEmail } from "@/lib/mail";
import { BILLING_COLUMNS, billingValues } from "@/lib/orders";
import { enrollInProgram, ensureProgramProgress } from "@/lib/programs";
import { createToken, hashToken } from "@/lib/tokens";

export function giftUrl(token: string): string {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}/hediye/${token}`;
}

/** Hediye edilen şey: tek kurs ya da Uzmanlık Programı (fiyatı çağıran sunucuda DB'den hesaplar). */
export type GiftTarget = { kind: "course"; courseId: number; title: string } | { kind: "program"; programId: number; title: string };

/**
 * Hediye siparişi: tek kalemli bir sipariş + ona bağlı `awaiting_payment` hediye.
 * Kurs: plan='single', kalem 'course'. Program: plan='cart', kalem 'program' (unit_price = hediye fiyatı B'); `gifts.program_id` dolu, `course_id` NULL.
 */
export async function createGiftOrder(i: {
  senderId: number;
  target: GiftTarget;
  price: number;
  recipientEmail: string;
  message: string | null;
  billing: Billing;
  provider: string;
  ip: string;
}): Promise<{ orderId: number; giftId: number }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const t = i.target;
    const [o] = t.kind === "course"
      ? await conn.execute<ResultSetHeader>("INSERT INTO orders (user_id, plan, course_id, amount, provider) VALUES (?, 'single', ?, ?, ?)", [i.senderId, t.courseId, i.price, i.provider])
      : await conn.execute<ResultSetHeader>("INSERT INTO orders (user_id, plan, amount, provider) VALUES (?, 'cart', ?, ?)", [i.senderId, i.price, i.provider]);
    const orderId = o.insertId;
    await conn.execute(`UPDATE orders SET ${BILLING_COLUMNS} WHERE id = ?`, [...billingValues(i.billing, i.ip), orderId]);
    if (t.kind === "course") {
      await conn.execute("INSERT INTO order_items (order_id, item_type, course_id, title, unit_price) VALUES (?, 'course', ?, ?, ?)", [orderId, t.courseId, t.title, i.price]);
    } else {
      await conn.execute("INSERT INTO order_items (order_id, item_type, program_id, title, unit_price) VALUES (?, 'program', ?, ?, ?)", [orderId, t.programId, t.title, i.price]);
    }
    const [g] = await conn.execute<ResultSetHeader>("INSERT INTO gifts (order_id, sender_id, course_id, program_id, recipient_email, message) VALUES (?, ?, ?, ?, ?, ?)", [
      orderId, i.senderId, t.kind === "course" ? t.courseId : null, t.kind === "program" ? t.programId : null, normalizeRecipientEmail(i.recipientEmail), i.message || null,
    ]);
    await conn.commit();
    return { orderId, giftId: g.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Hediyenin kurs/program ayrımı için ortak SQL parçaları: `g` = gifts takma adı; kurs ya da program LEFT JOIN'lenir. */
const GIFT_ITEM_JOINS = "LEFT JOIN courses c ON c.id = g.course_id LEFT JOIN programs pr ON pr.id = g.program_id";
const GIFT_ITEM_COLUMNS = "IF(g.program_id IS NULL, 'course', 'program') AS kind, COALESCE(c.slug, pr.slug) AS item_slug, COALESCE(c.title, pr.title) AS item_title";

/** Son 60 dakikada bu gönderenin oluşturduğu ve mail üreten (ödenmiş) hediye sayısı; mail bombalamaya karşı sınır için. İptal/ödenmemiş sayılmaz. */
export async function countRecentGiftsBySender(senderId: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM gifts WHERE sender_id = ? AND created_at > NOW() - INTERVAL 60 MINUTE AND status IN ('pending', 'claimed', 'expired')", [senderId]);
  return Number(rows[0]?.n ?? 0);
}

/**
 * `fulfillOrder` transaction'ı içinde, sipariş ödendiği anda çağrılır. Siparişe bağlı hediye yoksa null (normal sipariş).
 * Varsa token üretir (yalnızca SHA-256 özeti saklanır), hediyeyi `pending` yapar ve ham token'ı mail için döndürür.
 * Hediye satırı olup da aktive edilemeyecek bir durumdaysa fırlatır: kurs yanlışlıkla siparişi verene yazılmasın.
 */
export async function activateGiftForOrder(conn: PoolConnection, orderId: number): Promise<{ giftId: number; token: string } | null> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT id, status FROM gifts WHERE order_id = ? FOR UPDATE", [orderId]);
  const g = rows[0];
  if (!g) return null;
  if (g.status !== "awaiting_payment" && g.status !== "cancelled") throw new Error(`Hediye #${g.id} beklenmeyen durumda: ${g.status}`);
  const { raw, hash } = createToken();
  await conn.execute(
    `UPDATE gifts SET status = 'pending', token_hash = ?, expires_at = NOW() + INTERVAL ${GIFT_TTL_DAYS} DAY,
            sent_at = NOW(), send_count = 1, send_window_start = NOW() WHERE id = ?`,
    [hash, g.id],
  );
  return { giftId: g.id, token: raw };
}

/** Hediye maillerini yollar. Asla fırlatmaz: mail hatası ödemeyi bozmaz, gönderen panelden linki yenileyebilir. */
export async function sendGiftEmails(giftId: number, token: string, to: "both" | "recipient" = "both"): Promise<boolean> {
  let recipientSent = false;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT g.recipient_email, g.message, g.expires_at, ${GIFT_ITEM_COLUMNS}, u.full_name AS sender_name, u.email AS sender_email
         FROM gifts g ${GIFT_ITEM_JOINS} JOIN users u ON u.id = g.sender_id WHERE g.id = ?`,
      [giftId],
    );
    const g = rows[0];
    if (!g) return false;
    const url = giftUrl(token);
    const expiresAt = formatDate(g.expires_at);
    try {
      await sendGiftRecipientEmail({ to: g.recipient_email, kind: g.kind, senderName: g.sender_name, itemTitle: g.item_title, message: g.message, url, expiresAt });
      recipientSent = true;
    } catch (err) {
      console.error("[gift] alıcı maili gönderilemedi", { giftId, err });
    }
    if (to === "both") {
      try {
        await sendGiftSenderEmail({ to: g.sender_email, kind: g.kind, recipientEmail: g.recipient_email, itemTitle: g.item_title, url, expiresAt });
      } catch (err) {
        console.error("[gift] gönderen maili gönderilemedi", { giftId, err });
      }
    }
  } catch (err) {
    console.error("[gift] mailler hazırlanamadı", { giftId, err });
  }
  return recipientSent;
}

export type GiftView = {
  id: number;
  status: GiftStatus;
  recipientEmail: string;
  kind: GiftKind;
  itemSlug: string;
  itemTitle: string;
  senderName: string;
  message: string | null;
  secondsLeft: number;
};

/** Token'dan hediye. Bozuk/yok/pending olmayan/süresi geçmiş → null (süresi geçen satır burada `expired` işaretlenir). */
export async function findGiftByToken(token: string): Promise<GiftView | null> {
  if (!isGiftToken(token)) return null;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT g.id, g.status, g.recipient_email, g.message, ${GIFT_ITEM_COLUMNS}, u.full_name AS sender_name,
            TIMESTAMPDIFF(SECOND, NOW(), g.expires_at) AS secondsLeft
       FROM gifts g ${GIFT_ITEM_JOINS} JOIN users u ON u.id = g.sender_id
      WHERE g.token_hash = ? LIMIT 1`,
    [hashToken(token)],
  );
  const g = rows[0];
  if (!g || g.status !== "pending") return null;
  if (Number(g.secondsLeft) <= 0) {
    await pool.execute("UPDATE gifts SET status = 'expired' WHERE id = ? AND status = 'pending'", [g.id]);
    return null;
  }
  return {
    id: g.id,
    status: g.status,
    recipientEmail: g.recipient_email,
    kind: g.kind,
    itemSlug: g.item_slug,
    itemTitle: g.item_title,
    senderName: g.sender_name,
    message: g.message,
    secondsLeft: Number(g.secondsLeft),
  };
}

/** Bu adresle doğrulanmış, aktif bir hesap var mı (giriş mi kayıt mı yönlendirmesi için). */
export async function recipientHasAccount(email: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM users WHERE email = ? AND email_verified = 1 AND is_active = 1 LIMIT 1", [normalizeRecipientEmail(email)]);
  return rows.length > 0;
}

/**
 * Hediyeyi alır. Tek transaction: hediye satırı `FOR UPDATE` ile kilitlenir (çift alma yarışı yok), kural `claimBlock` ile
 * uygulanır; başarıda kurs `source='gift'` ile (program hediyesinde: programdaki her kurs + üyelik) yazılır, hediye `claimed`
 * olur ve token_hash NULL'lanır (tek kullanım). Program hediyesinde "zaten sahip" = zaten program üyesi; kurs sahipliği engel değildir.
 */
export async function claimGift(token: string, userId: number): Promise<{ ok: true; kind: GiftKind; slug: string } | { ok: false; reason: GiftClaimReason; kind?: GiftKind }> {
  if (!isGiftToken(token)) return { ok: false, reason: "invalid" };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Kilit token_hash (ikincil indeks) üzerinde değil birincil anahtarda alınır: aynı linke eş zamanlı iki istek
    // ikincil indeks kilitlerinde kilitlenip (deadlock) 500 dönüyordu. Kilit altında token yeniden doğrulanır;
    // kaybeden istek hediyeyi 'claimed' (ya da token'ı NULL) görür ve tek tip "geçersiz" alır.
    const hash = hashToken(token);
    const [found] = await conn.query<RowDataPacket[]>("SELECT id FROM gifts WHERE token_hash = ? LIMIT 1", [hash]);
    let g: RowDataPacket | undefined;
    if (found[0]) {
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT id, status, recipient_email, course_id, program_id, token_hash, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS secondsLeft FROM gifts WHERE id = ? FOR UPDATE",
        [found[0].id],
      );
      if (rows[0]?.token_hash === hash) g = rows[0];
    }
    const [users] = await conn.query<RowDataPacket[]>("SELECT email, email_verified FROM users WHERE id = ? AND is_active = 1", [userId]);
    const u = users[0];
    if (!g || !u) {
      await conn.rollback();
      return { ok: false, reason: "invalid" };
    }
    const kind: GiftKind = g.program_id != null ? "program" : "course";
    const [owned] = kind === "program"
      ? await conn.query<RowDataPacket[]>("SELECT 1 FROM program_enrollments WHERE user_id = ? AND program_id = ? LIMIT 1", [userId, g.program_id])
      : await conn.query<RowDataPacket[]>("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1", [userId, g.course_id]);
    const block = claimBlock(
      { status: g.status, secondsLeft: Number(g.secondsLeft), recipientEmail: g.recipient_email },
      { email: u.email, emailVerified: !!u.email_verified },
      owned.length > 0,
    );
    if (block) {
      if (g.status === "pending" && Number(g.secondsLeft) <= 0) await conn.execute("UPDATE gifts SET status = 'expired' WHERE id = ?", [g.id]);
      await conn.commit();
      // Tür yalnızca "zaten sahip" mesajı için eklenir (o noktaya ancak e-postası eşleşen doğrulanmış alıcı gelir); diğer hatalar bilgi sızdırmaz.
      return block === "already_owned" ? { ok: false, reason: block, kind } : { ok: false, reason: block };
    }
    let slug: string;
    if (kind === "program") {
      const [prog] = await conn.query<RowDataPacket[]>("SELECT slug FROM programs WHERE id = ?", [g.program_id]);
      slug = prog[0].slug;
      // Üyelik yeni değilse (sahiplik kontrolünden sonra başka yoldan eklendi) hiçbir şey tüketilmez: rollback kurs kayıtlarını da geri alır.
      // enrollInProgram(…, 'gift') programdaki her kursa grantCourseEnrollment uygular (Plus kaydı gift'e yükselir, diğer kaynaklar aynen kalır).
      if (!(await enrollInProgram(conn, userId, g.program_id, "gift"))) {
        await conn.rollback();
        return { ok: false, reason: "already_owned", kind };
      }
    } else {
      const [course] = await conn.query<RowDataPacket[]>("SELECT slug FROM courses WHERE id = ?", [g.course_id]);
      slug = course[0].slug;
      const [ins] = await conn.execute<ResultSetHeader>("INSERT IGNORE INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'gift')", [userId, g.course_id]);
      if (ins.affectedRows === 0) {
        // Sahiplik kontrolünden sonra kurs başka yoldan eklendi (satın alma/Plus): hediye tüketilmez, pending kalır.
        await conn.rollback();
        return { ok: false, reason: "already_owned", kind };
      }
    }
    await conn.execute("UPDATE gifts SET status = 'claimed', claimed_by_user_id = ?, claimed_at = NOW(), token_hash = NULL WHERE id = ?", [userId, g.id]);
    await conn.commit();
    // Alıcı program kurslarını daha önce bitirmiş olabilir: commit sonrası sertifika kontrolü (hatası hediyeyi bozmaz).
    if (kind === "program") await ensureProgramProgress(userId, { programId: g.program_id }).catch((err) => console.error("[gift] program ilerlemesi", { giftId: g.id, err }));
    return { ok: true, kind, slug };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type RotateResult = { status: "ok"; token: string } | { status: "rate_limited"; retryAfter: number } | { status: "not_found" };

/**
 * Gönderenin linki yenilemesi / maili yeniden göndermesi: token döndürülür (eski link geçersiz olur, `expires_at` uzamaz).
 * Cooldown ve saatlik sınır tek koşullu UPDATE ile uygulanır (eş zamanlı isteklerde de aşılamaz; DB saatiyle).
 * SET ifadeleri soldan sağa işlenir: send_count, window_start'tan önce yazılmalı (eski pencereye bakar).
 */
export async function rotateGiftToken(giftId: number, senderId: number): Promise<RotateResult> {
  const { raw, hash } = createToken();
  const windowExpired = `(send_window_start IS NULL OR send_window_start <= NOW() - INTERVAL ${GIFT_SEND_WINDOW_MINUTES} MINUTE)`;
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE gifts
        SET token_hash = ?,
            sent_at = NOW(),
            send_count = IF(${windowExpired}, 1, send_count + 1),
            send_window_start = IF(${windowExpired}, NOW(), send_window_start)
      WHERE id = ? AND sender_id = ? AND status = 'pending' AND expires_at > NOW()
        AND (sent_at IS NULL OR sent_at <= NOW() - INTERVAL ${GIFT_RESEND_COOLDOWN_SECONDS} SECOND)
        AND (${windowExpired} OR send_count < ?)`,
    [hash, giftId, senderId, GIFT_MAX_SENDS_PER_WINDOW],
  );
  if (res.affectedRows > 0) return { status: "ok", token: raw };

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT status, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS secondsLeft,
            GREATEST(0, ${GIFT_RESEND_COOLDOWN_SECONDS} - TIMESTAMPDIFF(SECOND, sent_at, NOW())) AS cooldown,
            IF(send_count >= ? AND NOT ${windowExpired},
               GREATEST(0, ${GIFT_SEND_WINDOW_MINUTES * 60} - TIMESTAMPDIFF(SECOND, send_window_start, NOW())), 0) AS capped
       FROM gifts WHERE id = ? AND sender_id = ? LIMIT 1`,
    [GIFT_MAX_SENDS_PER_WINDOW, giftId, senderId],
  );
  const g = rows[0];
  if (!g || g.status !== "pending" || Number(g.secondsLeft) <= 0) return { status: "not_found" };
  return { status: "rate_limited", retryAfter: Math.max(Number(g.cooldown ?? 0), Number(g.capped ?? 0), 1) };
}

export type SenderGift = {
  id: number;
  kind: GiftKind;
  itemSlug: string;
  itemTitle: string;
  recipientEmail: string;
  status: GiftStatus;
  expiresAt: string | null;
  createdAt: string;
};

/** Gönderenin hediyeleri (yalnızca kendi satırları; ödeme bekleyenler hariç). Süresi geçen `pending`'ler burada `expired` olur. */
export async function listGiftsForSender(senderId: number): Promise<SenderGift[]> {
  await pool.execute("UPDATE gifts SET status = 'expired' WHERE sender_id = ? AND status = 'pending' AND expires_at <= NOW()", [senderId]);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT g.id, ${GIFT_ITEM_COLUMNS}, g.recipient_email, g.status, g.expires_at, g.created_at
       FROM gifts g ${GIFT_ITEM_JOINS}
      WHERE g.sender_id = ? AND g.status <> 'awaiting_payment' ORDER BY g.id DESC`,
    [senderId],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    itemSlug: r.item_slug,
    itemTitle: r.item_title,
    recipientEmail: r.recipient_email,
    status: r.status,
    expiresAt: r.expires_at ?? null,
    createdAt: r.created_at,
  }));
}

/** Ödenmemiş (awaiting_payment) hediyeyi iptal eder; reddedilen siparişte çağrılır. Idempotent. */
export async function cancelGiftsForOrder(orderId: number): Promise<void> {
  await pool.execute("UPDATE gifts SET status = 'cancelled' WHERE order_id = ? AND status = 'awaiting_payment'", [orderId]);
}

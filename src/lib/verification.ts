import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { sendVerificationCodeEmail } from "@/lib/mail";
import {
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_WINDOW,
  RESEND_COOLDOWN_SECONDS,
  SEND_WINDOW_MINUTES,
  VERIFY_MESSAGES,
  codeMatches,
  generateCode,
  hashCode,
  verifyBlock,
} from "@/lib/verification-code";
import type { Role } from "@/lib/auth";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET tanımlı değil.");
  return s;
}

export type IssueResult =
  | { status: "sent" }
  | { status: "rate_limited"; retryAfter: number }
  | { status: "mail_failed" };

/**
 * Yeni doğrulama kodu üretir ve e-postayla yollar. Önceki kod geçersiz olur, deneme sayacı sıfırlanır.
 * Sıklık sınırı (bekleme süresi + saatlik üst sınır) tek bir koşullu UPDATE ile uygulanır; böylece eş zamanlı
 * isteklerde bile sınır aşılamaz. Zaman karşılaştırmaları DB saatiyle yapılır (uygulama sunucusu saatine bağımlı değil).
 * Mail gönderilemezse hak geri verilir; hesap silinmez, kullanıcı tekrar isteyebilir.
 */
export async function issueVerificationCode(userId: number, email: string): Promise<IssueResult> {
  const code = generateCode();
  const windowExpired = `(verification_window_start IS NULL OR verification_window_start <= NOW() - INTERVAL ${SEND_WINDOW_MINUTES} MINUTE)`;
  // SET ifadeleri soldan sağa işlenir: send_count, window_start'tan önce yazılmalı (eski pencereye bakar).
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE users
        SET verification_token_hash = ?,
            verification_token_expiry = NOW() + INTERVAL ${CODE_TTL_MINUTES} MINUTE,
            verification_attempts = 0,
            verification_sent_at = NOW(),
            verification_send_count = IF(${windowExpired}, 1, verification_send_count + 1),
            verification_window_start = IF(${windowExpired}, NOW(), verification_window_start)
      WHERE id = ? AND email_verified = 0 AND is_active = 1
        AND (verification_sent_at IS NULL OR verification_sent_at <= NOW() - INTERVAL ${RESEND_COOLDOWN_SECONDS} SECOND)
        AND (${windowExpired} OR verification_send_count < ?)`,
    [hashCode(userId, code, secret()), userId, MAX_SENDS_PER_WINDOW],
  );

  if (res.affectedRows === 0) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT GREATEST(0, ${RESEND_COOLDOWN_SECONDS} - TIMESTAMPDIFF(SECOND, verification_sent_at, NOW())) AS cooldown,
              IF(verification_send_count >= ? AND NOT ${windowExpired},
                 GREATEST(0, ${SEND_WINDOW_MINUTES * 60} - TIMESTAMPDIFF(SECOND, verification_window_start, NOW())), 0) AS capped
         FROM users WHERE id = ? LIMIT 1`,
      [MAX_SENDS_PER_WINDOW, userId],
    );
    const retryAfter = Math.max(Number(rows[0]?.cooldown ?? 0), Number(rows[0]?.capped ?? 0), 1);
    return { status: "rate_limited", retryAfter };
  }

  try {
    await sendVerificationCodeEmail(email, code, CODE_TTL_MINUTES);
    return { status: "sent" };
  } catch (err) {
    console.error("[verification-code] gönderilemedi:", err);
    if (process.env.NODE_ENV !== "production") console.log("[dev] doğrulama kodu:", code);
    await pool.execute(
      "UPDATE users SET verification_sent_at = NULL, verification_send_count = GREATEST(verification_send_count - 1, 0) WHERE id = ?",
      [userId],
    );
    return { status: "mail_failed" };
  }
}

export type VerifyResult =
  | { ok: true; user: { id: number; full_name: string; email: string; role: Role } }
  | { ok: false; status: number; message: string; reason: "invalid" | "expired" | "locked" | "wrong" | "inactive" };

/**
 * Kodu doğrular. Yanlış deneme sayacı karşılaştırmadan ÖNCE tek bir koşullu UPDATE ile artırılır; böylece
 * eş zamanlı istekler de en fazla MAX_ATTEMPTS karşılaştırma yapabilir. Doğru kod tek kullanımlıktır.
 */
export async function verifyEmailCode(email: string, code: string): Promise<VerifyResult> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, full_name, email, role, is_active, email_verified, verification_token_hash AS hash,
            verification_attempts AS attempts,
            TIMESTAMPDIFF(SECOND, NOW(), verification_token_expiry) AS secondsLeft
       FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  const u = rows[0];
  const block = verifyBlock(
    u ? { emailVerified: !!u.email_verified, hasCode: !!u.hash, secondsLeft: Number(u.secondsLeft ?? 0), attempts: Number(u.attempts) } : null,
  );
  if (block) return { ok: false, status: block === "invalid" ? 400 : block === "locked" ? 429 : 410, message: VERIFY_MESSAGES[block], reason: block };
  if (!u.is_active) return { ok: false, status: 403, message: "Hesabınız devre dışı. Lütfen destek ile iletişime geçin.", reason: "inactive" };

  const [claim] = await pool.execute<ResultSetHeader>(
    `UPDATE users SET verification_attempts = verification_attempts + 1
      WHERE id = ? AND email_verified = 0 AND verification_token_hash IS NOT NULL
        AND verification_token_expiry > NOW() AND verification_attempts < ?`,
    [u.id, MAX_ATTEMPTS],
  );
  if (claim.affectedRows === 0) return { ok: false, status: 429, message: VERIFY_MESSAGES.locked, reason: "locked" };

  if (!codeMatches(u.hash, u.id, code, secret())) {
    const remaining = Math.max(0, MAX_ATTEMPTS - (Number(u.attempts) + 1));
    return remaining === 0
      ? { ok: false, status: 429, message: VERIFY_MESSAGES.locked, reason: "locked" }
      : { ok: false, status: 400, message: VERIFY_MESSAGES.wrong(remaining), reason: "wrong" };
  }

  // Aynı kodla iki eş zamanlı istek gelirse yalnızca biri hesabı doğrulayabilir.
  const [done] = await pool.execute<ResultSetHeader>(
    `UPDATE users
        SET email_verified = 1, email_verified_at = NOW(), verification_token_hash = NULL,
            verification_token_expiry = NULL, verification_attempts = 0
      WHERE id = ? AND email_verified = 0 AND verification_token_hash = ?`,
    [u.id, u.hash],
  );
  if (done.affectedRows === 0) return { ok: false, status: 400, message: VERIFY_MESSAGES.invalid, reason: "invalid" };
  return { ok: true, user: { id: u.id, full_name: u.full_name, email: u.email, role: u.role } };
}

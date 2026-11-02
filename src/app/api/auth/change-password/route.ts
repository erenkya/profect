import bcrypt from "bcryptjs";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, getBaseUrl, ok, parseBody, serverError } from "@/lib/http";
import { sendPasswordChangeConfirmationEmail } from "@/lib/mail";
import { PASSWORD_CHANGE_COOLDOWN_SECONDS, PASSWORD_CHANGE_TTL_MINUTES } from "@/lib/password-change";
import { createToken } from "@/lib/tokens";
import { passwordSchema } from "@/lib/validation";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

/**
 * Şifre hemen değişmez: yeni şifrenin özeti beklemeye alınır ve e-postaya onay bağlantısı gider.
 * Şifre, bağlantı /api/auth/confirm-password-change ile onaylanınca uygulanır.
 */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;
  try {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT email, password_hash FROM users WHERE id = ? AND is_active = 1", [userId]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(body.data.currentPassword, user.password_hash))) {
      return fail("Mevcut şifre hatalı.", 400);
    }
    if (await bcrypt.compare(body.data.newPassword, user.password_hash)) {
      return fail("Yeni şifre mevcut şifrenizle aynı olamaz.", 400);
    }

    const { raw, hash } = createToken();
    // Bekleme süresi tek koşullu UPDATE ile uygulanır: eş zamanlı isteklerde de art arda mail gitmez.
    const [claim] = await pool.execute<ResultSetHeader>(
      `UPDATE users
          SET pending_password_hash = ?, pending_password_token_hash = ?,
              pending_password_expiry = NOW() + INTERVAL ${PASSWORD_CHANGE_TTL_MINUTES} MINUTE,
              pending_password_sent_at = NOW()
        WHERE id = ?
          AND (pending_password_sent_at IS NULL OR pending_password_sent_at <= NOW() - INTERVAL ${PASSWORD_CHANGE_COOLDOWN_SECONDS} SECOND)`,
      [await bcrypt.hash(body.data.newPassword, 10), hash, userId],
    );
    if (claim.affectedRows === 0) {
      return fail("Az önce bir onay e-postası gönderildi. Lütfen birkaç dakika bekleyip tekrar deneyin.", 429);
    }

    const url = `${getBaseUrl(request)}/sifre-degisikligi-onayla?token=${raw}`;
    try {
      await sendPasswordChangeConfirmationEmail(user.email, url, PASSWORD_CHANGE_TTL_MINUTES);
    } catch (err) {
      console.error("[change-password] e-posta gönderilemedi:", err);
      if (process.env.NODE_ENV !== "production") console.log("[dev] şifre değişikliği onay bağlantısı:", url);
      await pool.execute(
        `UPDATE users SET pending_password_hash = NULL, pending_password_token_hash = NULL,
                pending_password_expiry = NULL, pending_password_sent_at = NULL
          WHERE id = ? AND pending_password_token_hash = ?`,
        [userId, hash],
      );
      return fail("Onay e-postası gönderilemedi. Lütfen daha sonra tekrar deneyin.", 502);
    }
    return ok({ message: `Onay bağlantısı ${user.email} adresine gönderildi. Şifreniz, bağlantıyı onayladığınızda değişecek.` });
  } catch (err) {
    return serverError("[POST /api/auth/change-password]", err);
  }
}

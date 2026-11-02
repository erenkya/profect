import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { hashToken } from "@/lib/tokens";

const schema = z.object({ token: z.string().trim().min(1) });
const INVALID = "Onay bağlantısı geçersiz veya süresi dolmuş. Şifre değiştirmeyi hesabınızdan yeniden başlatın.";

/**
 * E-postadaki bağlantıyı onaylar: bekleyen şifre geçerli hale gelir. Oturum gerekmez; bağlantı, posta kutusuna
 * erişimin kanıtıdır. Tek bir koşullu UPDATE ile tek kullanımlıktır. Açık bir şifre sıfırlama bağlantısı varsa o da düşer.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE users
          SET password_hash = pending_password_hash,
              pending_password_hash = NULL, pending_password_token_hash = NULL,
              pending_password_expiry = NULL, pending_password_sent_at = NULL,
              reset_token_hash = NULL, reset_token_expiry = NULL
        WHERE pending_password_token_hash = ? AND pending_password_hash IS NOT NULL
          AND pending_password_expiry > NOW() AND is_active = 1`,
      [hashToken(body.data.token)],
    );
    if (res.affectedRows === 0) return fail(INVALID);
    return ok({ message: "Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz." });
  } catch (err) {
    return serverError("[POST /api/auth/confirm-password-change]", err);
  }
}

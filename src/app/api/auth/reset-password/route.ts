import bcrypt from "bcryptjs";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { hashToken } from "@/lib/tokens";
import { passwordSchema } from "@/lib/validation";

const schema = z.object({ token: z.string().trim().min(1), newPassword: passwordSchema });
const INVALID = "Sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeni bir talep oluşturun.";

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const hash = hashToken(body.data.token);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE reset_token_hash = ? AND reset_token_expiry > NOW() LIMIT 1",
      [hash],
    );
    if (rows.length === 0) return fail(INVALID);

    const newHash = await bcrypt.hash(body.data.newPassword, 10);
    const [res] = await pool.execute<ResultSetHeader>(
      // Sıfırlama bağlantısı yalnızca e-posta sahibine gider: tüketilmesi posta kutusuna erişimi kanıtlar, bu yüzden
      // henüz doğrulanmamış bir hesap da burada doğrulanır (şifre kayıtta değil, burada ya da doğrulamada belirlenir).
      `UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expiry = NULL,
              email_verified = 1, email_verified_at = COALESCE(email_verified_at, NOW()),
              verification_token_hash = NULL, verification_token_expiry = NULL, verification_attempts = 0,
              pending_password_hash = NULL, pending_password_token_hash = NULL,
              pending_password_expiry = NULL, pending_password_sent_at = NULL
        WHERE id = ? AND reset_token_hash = ?`,
      [newHash, rows[0].id, hash],
    );
    if (res.affectedRows === 0) return fail(INVALID);
    return ok({ message: "Şifreniz güncellendi. Şimdi giriş yapabilirsiniz." });
  } catch (err) {
    return serverError("[POST /api/auth/reset-password]", err);
  }
}

import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { hashToken } from "@/lib/tokens";

const schema = z.object({ token: z.string().trim().min(1, "Doğrulama bağlantısı eksik.") });
const INVALID = "Doğrulama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeni bir bağlantı isteyin.";

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const hash = hashToken(body.data.token);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM users
        WHERE verification_token_hash = ? AND verification_token_expiry > NOW() LIMIT 1`,
      [hash],
    );
    if (rows.length === 0) return fail(INVALID);

    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE users SET email_verified = 1, verification_token_hash = NULL, verification_token_expiry = NULL
        WHERE id = ? AND verification_token_hash = ?`,
      [rows[0].id, hash],
    );
    if (res.affectedRows === 0) return fail(INVALID);
    return ok({ message: "E-posta adresiniz doğrulandı. Şimdi giriş yapabilirsiniz." });
  } catch (err) {
    return serverError("[POST /api/auth/verify-email]", err);
  }
}

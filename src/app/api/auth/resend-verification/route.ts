import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getBaseUrl, ok, parseBody } from "@/lib/http";
import { issueVerificationEmail } from "@/lib/tokens";
import { emailSchema } from "@/lib/validation";

const schema = z.object({ email: emailSchema });
// Hesap var/yok bilgisi sızmasın diye her zaman aynı yanıt.
const GENERIC = "Eğer doğrulanmamış bir hesabınız varsa yeni bir doğrulama bağlantısı gönderildi.";

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, email FROM users WHERE email = ? AND email_verified = 0 AND is_active = 1 LIMIT 1",
      [body.data.email],
    );
    if (rows[0]) await issueVerificationEmail(rows[0].id, rows[0].email, getBaseUrl(request));
  } catch (err) {
    console.error("[POST /api/auth/resend-verification]", err);
  }
  return ok({ message: GENERIC });
}

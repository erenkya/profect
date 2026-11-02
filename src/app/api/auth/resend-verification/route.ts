import { NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { ok, parseBody } from "@/lib/http";
import { issueVerificationCode } from "@/lib/verification";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/verification-code";
import { emailSchema } from "@/lib/validation";

const schema = z.object({ email: emailSchema });
// Hesap var/yok bilgisi sızmasın diye (sıklık sınırı dışında) her zaman aynı yanıt.
const GENERIC = "Eğer doğrulanmamış bir hesabınız varsa yeni bir doğrulama kodu gönderildi.";

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, email FROM users WHERE email = ? AND email_verified = 0 AND is_active = 1 LIMIT 1",
      [body.data.email],
    );
    if (rows[0]) {
      const issued = await issueVerificationCode(rows[0].id, rows[0].email);
      if (issued.status === "rate_limited") {
        return NextResponse.json(
          { success: false, message: `Çok sık istek. ${issued.retryAfter} saniye sonra tekrar deneyin.`, retryAfter: issued.retryAfter },
          { status: 429 },
        );
      }
    }
  } catch (err) {
    console.error("[POST /api/auth/resend-verification]", err);
  }
  return ok({ message: GENERIC, retryAfter: RESEND_COOLDOWN_SECONDS });
}

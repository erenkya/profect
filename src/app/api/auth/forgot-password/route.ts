import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getBaseUrl, ok, parseBody } from "@/lib/http";
import { sendPasswordResetEmail } from "@/lib/mail";
import { createToken } from "@/lib/tokens";
import { emailSchema } from "@/lib/validation";

const schema = z.object({ email: emailSchema });
const GENERIC = "Eğer sistemde kaydınız varsa, sıfırlama bağlantısı gönderilmiştir.";

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return ok({ message: GENERIC });
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, email FROM users WHERE email = ? AND is_active = 1 LIMIT 1",
      [body.data.email],
    );
    const user = rows[0];
    if (user) {
      const { raw, hash } = createToken();
      await pool.execute(
        "UPDATE users SET reset_token_hash = ?, reset_token_expiry = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?",
        [hash, user.id],
      );
      const url = `${getBaseUrl(request)}/sifre-sifirla?token=${raw}`;
      try {
        await sendPasswordResetEmail(user.email, url);
      } catch (err) {
        console.error("[forgot-password] e-posta gönderilemedi:", err);
        if (process.env.NODE_ENV !== "production") console.log("[dev] sıfırlama bağlantısı:", url);
      }
    }
  } catch (err) {
    console.error("[POST /api/auth/forgot-password]", err);
  }
  return ok({ message: GENERIC });
}

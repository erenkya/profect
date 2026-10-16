import bcrypt from "bcryptjs";
import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { fail, getBaseUrl, ok, parseBody, serverError } from "@/lib/http";
import { verifyTurnstile } from "@/lib/turnstile";
import { issueVerificationEmail } from "@/lib/tokens";
import { emailSchema, passwordSchema } from "@/lib/validation";

const schema = z.object({
  full_name: z.string().trim().min(2, "Ad soyad gerekli.").max(150),
  email: emailSchema,
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  password: passwordSchema,
  kvkk: z.literal(true, { errorMap: () => ({ message: "KVKK aydınlatma metnini onaylamalısınız." }) }),
  turnstileToken: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const { full_name, email, phone, password, turnstileToken } = body.data;

  const bot = await verifyTurnstile(turnstileToken);
  if (!bot.ok) return fail(bot.message, bot.status);

  try {
    const hash = await bcrypt.hash(password, 10);
    let userId: number;
    try {
      const [res] = await pool.execute<ResultSetHeader>(
        `INSERT INTO users (full_name, email, phone, password_hash, kvkk_consent_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [full_name, email, phone || null, hash],
      );
      userId = res.insertId;
    } catch (err) {
      if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
        return fail("Bu e-posta adresiyle kayıtlı bir hesap zaten var.", 409);
      }
      throw err;
    }

    // Oturum burada AÇILMAZ: e-posta doğrulandıktan sonra giriş yapılır.
    await issueVerificationEmail(userId, email, getBaseUrl(request));
    return ok({ message: "Kayıt oluşturuldu. E-posta adresinize bir doğrulama bağlantısı gönderdik." }, 201);
  } catch (err) {
    return serverError("[POST /api/auth/register]", err);
  }
}

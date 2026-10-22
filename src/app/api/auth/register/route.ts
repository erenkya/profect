import bcrypt from "bcryptjs";
import { z } from "zod";
import pool from "@/lib/db";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { verifyTurnstile } from "@/lib/turnstile";
import { passwordProblem } from "@/lib/password-strength";
import { emailSchema, passwordSchema } from "@/lib/validation";

const schema = z.object({
  full_name: z.string().trim().min(2, "Ad soyad gerekli.").max(150),
  email: emailSchema,
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  password: passwordSchema,
  kvkk: z.literal(true, { errorMap: () => ({ message: "KVKK aydınlatma metnini onaylamalısınız." }) }),
  turnstileToken: z.string().optional(),
}).superRefine((d, ctx) => {
  // Genel şifre kuralları passwordSchema'da; ad/e-posta içeriyor mu kontrolü alanlar birlikteyken yapılır.
  const problem = passwordProblem(d.password, [d.full_name, d.email]);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: problem });
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const { full_name, email, phone, password, turnstileToken } = body.data;

  const bot = await verifyTurnstile(turnstileToken);
  if (!bot.ok) return fail(bot.message, bot.status);

  try {
    const hash = await bcrypt.hash(password, 10);
    try {
      await pool.execute(
        `INSERT INTO users (full_name, email, phone, password_hash, email_verified, kvkk_consent_at)
         VALUES (?, ?, ?, ?, 1, NOW())`,
        [full_name, email, phone || null, hash],
      );
    } catch (err) {
      if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
        return fail("Bu e-posta adresiyle kayıtlı bir hesap zaten var.", 409);
      }
      throw err;
    }

    // Şimdilik e-posta doğrulaması yok (email_verified=1). Oturum açılmaz; kullanıcı giriş sayfasına yönlenir.
    return ok({ message: "Kayıt oluşturuldu. Şimdi giriş yapabilirsiniz." }, 201);
  } catch (err) {
    return serverError("[POST /api/auth/register]", err);
  }
}

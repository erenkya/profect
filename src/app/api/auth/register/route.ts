import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { issueVerificationCode } from "@/lib/verification";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/verification-code";
import { verifyTurnstile } from "@/lib/turnstile";
import { GIFT_INVALID_MESSAGE, isGiftToken } from "@/lib/gift-rules";
import { findGiftByToken } from "@/lib/gifts";
import { emailSchema } from "@/lib/validation";

const schema = z.object({
  full_name: z.string().trim().min(2, "Ad soyad gerekli.").max(150),
  email: emailSchema,
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  kvkk: z.literal(true, { errorMap: () => ({ message: "KVKK aydınlatma metnini onaylamalısınız." }) }),
  turnstileToken: z.string().optional(),
  giftToken: z.string().max(200).refine(isGiftToken).optional(),
});

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const { full_name, phone, turnstileToken, giftToken } = body.data;
  let email = body.data.email;

  const bot = await verifyTurnstile(turnstileToken);
  if (!bot.ok) return fail(bot.message, bot.status);

  try {
    if (giftToken) {
      // Hediye linkiyle kayıtta e-posta, gövdedekine bakılmadan hediyedeki alıcı adresine kilitlenir.
      const gift = await findGiftByToken(giftToken);
      if (!gift) return fail(GIFT_INVALID_MESSAGE, 400);
      email = gift.recipientEmail;
    }
    // Şifre burada ALINMAZ ve saklanmaz: hesap şifresi, e-posta kodunu giren kişi tarafından doğrulama adımında
    // yazılır. Aksi halde bir başkası aynı adresle kayıt olup hesabın şifresini belirleyebilirdi. Satırda hiçbir
    // girişle eşleşmeyecek rastgele bir bcrypt özeti durur.
    const hash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    let userId: number;
    try {
      const [res] = await pool.execute<ResultSetHeader>(
        `INSERT INTO users (full_name, email, phone, password_hash, email_verified, kvkk_consent_at)
         VALUES (?, ?, ?, ?, 0, NOW())`,
        [full_name, email, phone || null, hash],
      );
      userId = res.insertId;
    } catch (err) {
      if ((err as { code?: string }).code !== "ER_DUP_ENTRY") throw err;
      // Doğrulanmış hesap varsa kayıt reddedilir. Doğrulanmamış (yarım kalmış) kayıt varsa yeni kod gönderilir
      // (eski kod geçersiz olur); şifreye DOKUNULMAZ, o doğrulama adımında belirlenir.
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE email = ? AND email_verified = 0 AND is_active = 1 AND role = 'user' LIMIT 1",
        [email],
      );
      if (!rows[0]) return fail("Bu e-posta adresiyle kayıtlı bir hesap zaten var.", 409);
      userId = rows[0].id;
      const issued = await issueVerificationCode(userId, email);
      if (issued.status === "rate_limited") {
        return NextResponse.json(
          { success: false, message: `Bu e-posta için kısa süre önce kod gönderildi. ${issued.retryAfter} saniye sonra tekrar deneyin.`, retryAfter: issued.retryAfter },
          { status: 429 },
        );
      }
      await pool.execute(
        "UPDATE users SET full_name = ?, phone = ?, kvkk_consent_at = NOW() WHERE id = ? AND email_verified = 0",
        [full_name, phone || null, userId],
      );
      return registered(email);
    }

    const issued = await issueVerificationCode(userId, email);
    return registered(email);
  } catch (err) {
    return serverError("[POST /api/auth/register]", err);
  }
}

/** Hesap açıldı ama e-posta doğrulanana kadar giriş yapılamaz; istemci kod ekranına yönlenir. */
function registered(email: string) {
  return ok(
    {
      needsVerification: true,
      email,
      retryAfter: RESEND_COOLDOWN_SECONDS,
      message: "Kayıt oluşturuldu. E-posta adresinize 6 haneli bir doğrulama kodu gönderdik.",
    },
    201,
  );
}

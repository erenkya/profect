import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { generateJwt, setAuthCookies } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { verifyTurnstile } from "@/lib/turnstile";
import { loginOutcome } from "@/lib/login-rules";
import { issueVerificationCode } from "@/lib/verification";

const schema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(190),
  password: z.string().min(1).max(200),
  turnstileToken: z.string().optional(),
});

// Kullanıcı yokken de bcrypt çalıştırılır: yanıt süresi hesabın var olup olmadığını ele vermesin.
const DUMMY_HASH = bcrypt.hashSync("profect-dummy-password", 10);

export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const { email, password, turnstileToken } = body.data;

  const bot = await verifyTurnstile(turnstileToken);
  if (!bot.ok) return fail(bot.message, bot.status);

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, full_name, email, password_hash, role, is_active, email_verified FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    const user = rows[0];
    const match = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    const outcome = loginOutcome({ exists: !!user, active: !!user?.is_active, verified: !!user?.email_verified, passwordMatches: match });
    if (outcome === "invalid") return fail("E-posta veya şifre hatalı.", 401);
    if (outcome === "inactive") return fail("Hesabınız devre dışı. Lütfen destek ile iletişime geçin.", 403);

    if (outcome === "needs_verification") {
      // Doğrulanmamış hesapta şifre kanıt değildir (kayıtta saklanmaz): bekleme süresi dolmuşsa yeni kod gider,
      // istemci kod ekranına yönlenir ve hesap şifresini orada, kodu girerken belirler.
      await issueVerificationCode(user.id, user.email);
      return NextResponse.json(
        {
          success: false,
          needsVerification: true,
          email: user.email,
          message: "E-posta adresiniz henüz doğrulanmadı. Size gönderilen 6 haneli kodu girin.",
        },
        { status: 403 },
      );
    }

    await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

    const sessionUser = { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
    const token = await generateJwt({ userId: user.id, email: user.email, role: user.role });
    return setAuthCookies(ok({ user: sessionUser }), token, sessionUser);
  } catch (err) {
    return serverError("[POST /api/auth/login]", err);
  }
}

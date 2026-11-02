import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { generateJwt, setAuthCookies } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { passwordProblem } from "@/lib/password-strength";
import { verifyEmailCode } from "@/lib/verification";
import { normalizeCode } from "@/lib/verification-code";
import { emailSchema, passwordSchema } from "@/lib/validation";

const schema = z.object({ email: emailSchema, code: z.string().max(32), password: passwordSchema });

/**
 * Kod doğruysa e-posta onaylanır, hesabın şifresi gönderilen şifre olarak yazılır ve kullanıcı oturum açmış olur.
 * Şifre kayıtta değil burada belirlenir: kodu girebilen kişi e-posta sahibidir, şifreyi de o seçer.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const code = normalizeCode(body.data.code);
  if (!code) return fail("Doğrulama kodu 6 haneli bir sayı olmalıdır.");

  try {
    // Şifre kuralları kod denemesi harcanmadan önce denetlenir (ad/e-posta içeren şifre dahil).
    const [rows] = await pool.query<RowDataPacket[]>("SELECT full_name FROM users WHERE email = ? LIMIT 1", [body.data.email]);
    const problem = passwordProblem(body.data.password, [rows[0]?.full_name ?? "", body.data.email]);
    // `field` istemcinin (kayıttan taşınan) şifreyi bırakıp yeniden sormasını sağlar.
    if (problem) return NextResponse.json({ success: false, message: problem, field: "password" }, { status: 400 });

    const result = await verifyEmailCode(body.data.email, code, () => bcrypt.hash(body.data.password, 10));
    if (!result.ok) return fail(result.message, result.status);

    const { user } = result;
    const token = await generateJwt({ userId: user.id, email: user.email, role: user.role });
    return setAuthCookies(ok({ user, message: "E-posta adresiniz doğrulandı." }), token, user);
  } catch (err) {
    return serverError("[POST /api/auth/verify-email]", err);
  }
}

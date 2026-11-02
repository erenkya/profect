import { z } from "zod";
import { generateJwt, setAuthCookies } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { verifyEmailCode } from "@/lib/verification";
import { normalizeCode } from "@/lib/verification-code";
import { emailSchema } from "@/lib/validation";

const schema = z.object({ email: emailSchema, code: z.string().max(32) });

/** Kod doğruysa e-posta onaylanır ve kullanıcı doğrudan oturum açmış olur (kayıt akışı tek adımda biter). */
export async function POST(request: Request) {
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const code = normalizeCode(body.data.code);
  if (!code) return fail("Doğrulama kodu 6 haneli bir sayı olmalıdır.");

  try {
    const result = await verifyEmailCode(body.data.email, code);
    if (!result.ok) return fail(result.message, result.status);

    const { user } = result;
    const token = await generateJwt({ userId: user.id, email: user.email, role: user.role });
    return setAuthCookies(ok({ user, message: "E-posta adresiniz doğrulandı." }), token, user);
  } catch (err) {
    return serverError("[POST /api/auth/verify-email]", err);
  }
}


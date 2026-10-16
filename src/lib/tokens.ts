import "server-only";
import crypto from "node:crypto";
import pool from "@/lib/db";
import { sendVerificationEmail } from "@/lib/mail";

/** Ham token yalnızca e-postadaki bağlantıda yaşar; DB'ye SHA-256 özeti yazılır. */
export function createToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: crypto.createHash("sha256").update(raw).digest("hex") };
}

export const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

/** Doğrulama bağlantısı üretir (24 saat), e-postayı yollar. Mail hatası hesabı geri almaz. */
export async function issueVerificationEmail(userId: number, email: string, baseUrl: string) {
  const { raw, hash } = createToken();
  await pool.execute(
    "UPDATE users SET verification_token_hash = ?, verification_token_expiry = DATE_ADD(NOW(), INTERVAL 24 HOUR) WHERE id = ?",
    [hash, userId],
  );
  const url = `${baseUrl}/e-posta-dogrula?token=${raw}`;
  try {
    await sendVerificationEmail(email, url);
  } catch (err) {
    console.error("[verification-email] gönderilemedi:", err);
    if (process.env.NODE_ENV !== "production") console.log("[dev] doğrulama bağlantısı:", url);
  }
}

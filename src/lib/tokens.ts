import "server-only";
import crypto from "node:crypto";

/** Şifre sıfırlama bağlantısı için. Ham token yalnızca e-postadaki bağlantıda yaşar; DB'ye SHA-256 özeti yazılır. */
export function createToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: crypto.createHash("sha256").update(raw).digest("hex") };
}

export const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

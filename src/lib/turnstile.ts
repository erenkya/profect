import "server-only";

// Cloudflare Turnstile sunucu doğrulaması. Canlı anahtarlar yalnızca NEXT_PUBLIC_IS_PRODUCTION=true iken;
// aksi halde Cloudflare'ın test anahtarları kullanılır (localhost'ta çalışır).
export const isProductionKeys = () =>
  process.env.NEXT_PUBLIC_IS_PRODUCTION === "true" || process.env.IS_PRODUCTION === "true";

export async function verifyTurnstile(token: unknown): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (typeof token !== "string" || !token) {
    return { ok: false, status: 400, message: "Bot doğrulaması eksik. Sayfayı yenileyip tekrar deneyin." };
  }
  const secret = isProductionKeys() ? process.env.CLOUDFLARE_SECRET_KEY : process.env.TEST_CLOUDFLARE_SECRET_KEY;
  const body = new URLSearchParams();
  if (secret) body.append("secret", secret);
  body.append("response", token);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) {
      return { ok: false, status: 403, message: "Bot doğrulaması başarısız. Sayfayı yenileyip tekrar deneyin." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[turnstile]", err);
    return { ok: false, status: 502, message: "Bot doğrulaması sırasında bir hata oluştu." };
  }
}

/** İstemciye verilecek site anahtarı (canlı/test seçimi sunucuda yapılır). */
export const turnstileSiteKey = () =>
  (isProductionKeys() ? process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY : process.env.NEXT_PUBLIC_TEST_CLOUDFLARE_SITE_KEY) ?? "";

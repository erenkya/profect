import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, FormMessage } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getCurrentUser } from "@/lib/auth";
import { GIFT_INVALID_MESSAGE, isGiftToken } from "@/lib/gift-rules";
import { findGiftByToken } from "@/lib/gifts";
import { safeNext } from "@/lib/safe-redirect";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = { title: "Kayıt ol" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; hediye?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getCurrentUser()) redirect(next);
  // Hediye linkinden gelindiyse e-posta alıcı adresine kilitlenir (sunucu da kayıtta aynısını zorlar).
  const gift = isGiftToken(sp.hediye) ? await findGiftByToken(sp.hediye) : null;
  return (
    <AuthShell title="Hesap oluştur" subtitle={gift ? "Hediyeni almak için bu e-posta adresiyle kayıt ol." : "Ücretsiz kaydol, kursları keşfet."}>
      {sp.hediye && !gift && <FormMessage kind="error">{GIFT_INVALID_MESSAGE}</FormMessage>}
      <RegisterForm siteKey={turnstileSiteKey()} next={next} lockedEmail={gift?.recipientEmail} giftToken={gift ? sp.hediye : undefined} />
    </AuthShell>
  );
}

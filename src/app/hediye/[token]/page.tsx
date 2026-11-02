import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, FormMessage } from "@/components/auth/AuthShell";
import { ClaimGiftButton, SwitchAccountButton } from "@/components/gifts/ClaimGiftButton";
import { getCurrentUser } from "@/lib/auth";
import { GIFT_INVALID_MESSAGE, maskEmail, normalizeRecipientEmail } from "@/lib/gift-rules";
import { findGiftByToken, recipientHasAccount } from "@/lib/gifts";

// Token URL'de yaşar: indekslenmez; Referrer-Policy/Cache-Control başlıkları next.config.ts'te.
export const metadata: Metadata = { title: "Hediyeni al", robots: { index: false, follow: false } };

export default async function GiftClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Bozuk/bulunamayan/süresi dolan/alınan/iptal edilen hediye için tek tip mesaj (bilgi sızdırmaz).
  const gift = await findGiftByToken(token);
  if (!gift) {
    return (
      <AuthShell title="Hediye">
        <FormMessage kind="error">{GIFT_INVALID_MESSAGE}</FormMessage>
        <Link href="/" style={{ fontSize: 14 }}>Ana sayfaya dön</Link>
      </AuthShell>
    );
  }

  const user = await getCurrentUser();
  const next = `/hediye/${token}`; // token findGiftByToken'da 64 küçük hex olarak doğrulandı
  if (!user) {
    if (await recipientHasAccount(gift.recipientEmail)) redirect(`/giris?next=${encodeURIComponent(next)}`);
    redirect(`/kayit?hediye=${token}&next=${encodeURIComponent(next)}`);
  }

  if (normalizeRecipientEmail(user.email) !== gift.recipientEmail) {
    return (
      <AuthShell title="Hediye" subtitle="Bu hediye başka bir hesaba ait.">
        <FormMessage kind="error">
          Bu hediye {maskEmail(gift.recipientEmail)} adresine gönderildi; şu an {user.email} ile giriş yaptın. Hediye yalnızca o adresle alınabilir.
        </FormMessage>
        <SwitchAccountButton token={token} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Hediyen hazır" subtitle={`${gift.senderName} sana bir ${gift.kind === "program" ? "program" : "kurs"} hediye etti.`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
        <strong style={{ fontWeight: 600 }}>{gift.itemTitle}</strong>
        {gift.message && <p style={{ margin: 0, color: "var(--muted-72)", whiteSpace: "pre-wrap" }}>“{gift.message}”</p>}
      </div>
      <ClaimGiftButton token={token} />
    </AuthShell>
  );
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getCurrentUser } from "@/lib/auth";
import { getAccountProfile } from "@/lib/lms";
import { paymentProvider } from "@/lib/payment";
import { getProgramOffer } from "@/lib/programs";

export const metadata: Metadata = { title: "Program hediye et", robots: { index: false, follow: false } };

export default async function GiftProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // /hediye-et proxy.ts'in korumasında değil: oturum kontrolü burada yapılır.
  const user = await getCurrentUser();
  if (!user) redirect(`/giris?next=${encodeURIComponent(`/hediye-et/program/${slug}`)}`);
  // Hediye fiyatı B' (kişiye özel kredi yok: gönderenin sahip olduğu kurslar fiyatı etkilemez); satışa kapalı program hediye edilemez.
  const offer = await getProgramOffer(slug, null);
  if (!offer || !offer.sellable || offer.calc.effectivePrice <= 0) notFound();
  const profile = await getAccountProfile(user.id);
  return (
    <main className="wrap" style={{ paddingBlock: "clamp(40px,6vw,80px)" }}>
      <div className="eyebrow">Hediye</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 28px" }}>Program hediye et</h1>
      <CheckoutForm
        defaults={{ full_name: user.full_name, email: user.email, phone: profile?.phone ?? "" }}
        gift={{ kind: "program", slug: offer.program.slug, title: offer.program.title, price: offer.calc.effectivePrice, provider: paymentProvider().id }}
      />
    </main>
  );
}

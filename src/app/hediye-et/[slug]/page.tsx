import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getCurrentUser } from "@/lib/auth";
import { getAccountProfile, getCourseBySlug } from "@/lib/lms";
import { paymentProvider } from "@/lib/payment";

export const metadata: Metadata = { title: "Kurs hediye et", robots: { index: false, follow: false } };

export default async function GiftCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // /hediye-et proxy.ts'in korumasında değil: oturum kontrolü burada yapılır.
  const user = await getCurrentUser();
  if (!user) redirect(`/giris?next=${encodeURIComponent(`/hediye-et/${slug}`)}`);
  const course = await getCourseBySlug(slug);
  if (!course || course.price <= 0) notFound();
  const profile = await getAccountProfile(user.id);
  return (
    <main className="wrap" style={{ paddingBlock: "clamp(40px,6vw,80px)" }}>
      <div className="eyebrow">Hediye</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 28px" }}>Kurs hediye et</h1>
      <CheckoutForm
        defaults={{ full_name: user.full_name, email: user.email, phone: profile?.phone ?? "" }}
        gift={{ kind: "course", slug: course.slug, title: course.title, price: course.price, provider: paymentProvider().id }}
      />
    </main>
  );
}

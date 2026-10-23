import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getCurrentUser } from "@/lib/auth";
import { getAccountProfile } from "@/lib/lms";

export const metadata: Metadata = { title: "Ödeme", robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  // proxy.ts oturumu zaten zorunlu kılar; burada DB doğrulamalı güncel kullanıcı okunur (form ön doldurma için).
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/odeme");
  const profile = await getAccountProfile(user.id);
  return (
    <main className="wrap" style={{ paddingBlock: "clamp(40px,6vw,80px)" }}>
      <div className="eyebrow">Sipariş</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 28px" }}>Güvenli ödeme</h1>
      <CheckoutForm defaults={{ full_name: user.full_name, email: user.email, phone: profile?.phone ?? "" }} />
    </main>
  );
}

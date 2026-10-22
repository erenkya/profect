import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = { title: "Kayıt ol" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Hesap oluştur" subtitle="Ücretsiz kaydol, kursları keşfet.">
      <RegisterForm siteKey={turnstileSiteKey()} next={next} />
    </AuthShell>
  );
}

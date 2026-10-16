import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getCurrentUser } from "@/lib/auth";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = { title: "Kayıt ol" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/hesabim");
  return (
    <AuthShell title="Hesap oluştur" subtitle="Ücretsiz kaydol, kursları keşfet.">
      <RegisterForm siteKey={turnstileSiteKey()} />
    </AuthShell>
  );
}

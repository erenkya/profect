import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";
import { turnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = { title: "Giriş yap" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Giriş yap" subtitle="Kurslarına ve sertifikalarına eriş.">
      <LoginForm siteKey={turnstileSiteKey()} next={next} />
    </AuthShell>
  );
}

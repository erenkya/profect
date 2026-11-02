import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyEmail } from "@/components/auth/SimpleForms";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "E-posta doğrulama" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string }> }) {
  const q = await searchParams;
  const next = safeNext(q.next);
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="E-posta doğrulama" subtitle="Hesabınızı etkinleştirmek için kodu girin.">
      <VerifyEmail email={(q.email ?? "").trim().toLowerCase()} next={next} />
    </AuthShell>
  );
}

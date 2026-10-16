import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyEmail } from "@/components/auth/SimpleForms";

export const metadata: Metadata = { title: "E-posta doğrulama" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <AuthShell title="E-posta doğrulama">
      <VerifyEmail token={(await searchParams).token ?? ""} />
    </AuthShell>
  );
}

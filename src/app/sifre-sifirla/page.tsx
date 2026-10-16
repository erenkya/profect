import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/SimpleForms";

export const metadata: Metadata = { title: "Şifre sıfırla" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <AuthShell title="Yeni şifre belirle">
      <ResetPasswordForm token={(await searchParams).token ?? ""} />
    </AuthShell>
  );
}

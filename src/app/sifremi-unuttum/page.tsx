import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/SimpleForms";

export const metadata: Metadata = { title: "Şifremi unuttum" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Şifremi unuttum" subtitle="E-postana bir sıfırlama bağlantısı göndereceğiz.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}

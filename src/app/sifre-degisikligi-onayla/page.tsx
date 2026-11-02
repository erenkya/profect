import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ConfirmPasswordChange } from "@/components/auth/SimpleForms";

export const metadata: Metadata = { title: "Şifre değişikliğini onayla" };

export default async function ConfirmPasswordChangePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <AuthShell title="Şifre değişikliğini onayla">
      <ConfirmPasswordChange token={(await searchParams).token ?? ""} />
    </AuthShell>
  );
}

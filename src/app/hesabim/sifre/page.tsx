import type { Metadata } from "next";
import { PageTitle } from "@/components/account/PageTitle";
import { ChangePasswordForm } from "@/components/learn/ChangePasswordForm";

export const metadata: Metadata = { title: "Şifre ve güvenlik" };

export default function PasswordPage() {
  return (
    <>
      <PageTitle title="Şifre ve güvenlik" hint="Hesabını korumak için güçlü bir şifre kullan." />
      <ChangePasswordForm />
    </>
  );
}

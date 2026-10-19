import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/account/PageTitle";
import { ProfileForm } from "@/components/account/ProfileForm";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getAccountProfile } from "@/lib/lms";

export const metadata: Metadata = { title: "Profil bilgileri" };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim/profil");
  const p = await getAccountProfile(user.id);
  if (!p) redirect("/giris?next=/hesabim/profil");
  return (
    <>
      <PageTitle title="Profil bilgileri" hint={<>Üyelik tarihi: {formatDate(p.created_at)}{!p.email_verified && " · E-posta doğrulanmadı"}</>} />
      <ProfileForm initialName={p.full_name} initialPhone={p.phone ?? ""} email={p.email} />
    </>
  );
}

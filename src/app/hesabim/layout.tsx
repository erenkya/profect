import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/account/AccountNav";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Hesabım", template: "%s · Hesabım" }, robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts oturumu zaten zorunlu kılar; burada DB doğrulamalı güncel kullanıcı kontrolü yapılır.
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim");
  return (
    <div className="wrap acc-shell">
      <aside className="acc-side">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Hesabım</div>
        <AccountNav />
      </aside>
      <main className="acc-main">{children}</main>
    </div>
  );
}

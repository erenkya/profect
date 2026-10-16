import type { Metadata } from "next";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { requireAdminPage } from "@/lib/admin-guard";

export const metadata: Metadata = { title: { default: "Yönetim", template: "%s · Yönetim" }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="admin-shell">
      <div className="eyebrow">Yönetim paneli</div>
      <AdminTabs />
      {children}
    </div>
  );
}

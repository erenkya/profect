import type { Metadata } from "next";
import { requireStaffPage } from "@/lib/admin-guard";

export const metadata: Metadata = { title: { default: "Eğitmen", template: "%s · Eğitmen" }, robots: { index: false, follow: false } };

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage();
  return (
    <div className="admin-shell">
      <div className="eyebrow">Eğitmen paneli</div>
      {children}
    </div>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Şirket paneli", template: "%s · Şirket paneli" }, robots: { index: false, follow: false } };

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return <main className="wrap" style={{ paddingBlock: "clamp(32px,5vw,64px)" }}>{children}</main>;
}

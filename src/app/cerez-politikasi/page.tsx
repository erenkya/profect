import type { Metadata } from "next";
import Link from "next/link";
import { CookiePolicyContent } from "@/components/legal/CookiePolicyContent";

export const metadata: Metadata = {
  title: "Çerez Politikası",
  description: "Profect’te hangi çerezleri neden kullandığımız ve çerez tercihlerinizi nasıl yönetebileceğiniz.",
};

export default function CookiePolicyPage() {
  return (
    <main className="wrap" style={{ paddingBlock: "clamp(56px,8vw,112px)", maxWidth: 820 }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>Yasal</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,64px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 12px" }}>Çerez Politikası</h1>
      <p style={{ color: "var(--muted-72)", margin: "0 0 40px" }}>Çerezler ve benzeri teknolojiler hakkında bilgilendirme (KVKK m.10).</p>
      <CookiePolicyContent />
      <p style={{ marginTop: 48 }}><Link href="/">← Ana sayfaya dön</Link></p>
    </main>
  );
}

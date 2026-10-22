import type { Metadata } from "next";
import Link from "next/link";
import { KvkkContent } from "@/components/legal/KvkkContent";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni",
  description: "Profect olarak kişisel verilerinizi hangi amaçlarla işlediğimiz ve haklarınız hakkında aydınlatma metni.",
};

export default function KvkkPage() {
  return (
    <main className="wrap" style={{ paddingBlock: "clamp(56px,8vw,112px)", maxWidth: 820 }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>Yasal</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,64px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 12px" }}>KVKK Aydınlatma Metni</h1>
      <p style={{ color: "var(--muted-72)", margin: "0 0 40px" }}>Kişisel Verilerin Korunması Kanunu (6698) kapsamında bilgilendirme.</p>
      <KvkkContent />
      <p style={{ marginTop: 48 }}><Link href="/kayit">← Kayıt sayfasına dön</Link></p>
    </main>
  );
}

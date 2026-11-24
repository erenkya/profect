"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CookieSettingsButton } from "@/components/legal/CookieSettingsButton";
import { COMPANY } from "@/components/legal/company";

export function Footer() {
  const pathname = usePathname();

  // Ders sayfası odaklı görünüm: alt bilgi gösterilmez.
  if (/^\/ogrenim\/[^/]+\/ders\//.test(pathname)) return null;

  return (
    <footer
      className="wrap"
      style={{
        paddingBlock: "56px 40px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))",
        gap: 32,
        fontSize: 14,
      }}
    >
      <div className="footer-brand">
        <Image
          src="/profect-logo.jpeg"
          alt="profect"
          width={173}
          height={47}
          style={{ height: 30, width: "auto", mixBlendMode: "multiply", marginBottom: 14 }}
        />
        <div style={{ color: "var(--muted-55)", lineHeight: 1.6 }}>
          <div>© 2026 {COMPANY.name}. Tüm hakları saklıdır.</div>
          <div style={{ marginTop: 8 }}>{COMPANY.address}</div>
          <div>MERSİS: {COMPANY.mersis}</div>
        </div>
      </div>
      <div className="footer-col">
        <div className="footer-title">Platform</div>
        <Link href="/kurslar">Eğitimler</Link>
        <Link href="/programlar">Uzmanlık Alanları</Link>
        <Link href="/blog">Blog</Link>
        <Link href="/haberler">Haberler</Link>
      </div>
      <div className="footer-col">
        <div className="footer-title">Şirket</div>
        <Link href="/hakkimizda">Hakkımızda</Link>
        <Link href="/iletisim">İletişim</Link>
        <a href="https://www.linkedin.com/company/profect-academy/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        <Link href="/mesafeli-satis-sozlesmesi">Mesafeli Satış Sözleşmesi</Link>
        <Link href="/iade-ve-iptal">Teslimat, İade ve İptal</Link>
        <Link href="/gizlilik-ve-guvenlik">Gizlilik ve Güvenlik</Link>
        <Link href="/kvkk">KVKK Aydınlatma Metni</Link>
        <Link href="/cerez-politikasi">Çerez Politikası</Link>
        <Link href="/icerik-bildirimi">İçerik ve Telif Bildirimi</Link>
        <CookieSettingsButton className="footer-link-btn">Çerez Tercihleri</CookieSettingsButton>
      </div>
    </footer>
  );
}

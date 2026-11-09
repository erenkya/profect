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
        <div style={{ color: "var(--muted-55)" }}>© 2026 Profect. Tüm hakları saklıdır.</div>
      </div>
      <div className="footer-col">
        <div className="footer-title">Platform</div>
        <Link href="/kurslar">Kurslar</Link>
        <Link href="/blog">Blog</Link>
        <Link href="/haberler">Haberler</Link>
      </div>
      <div className="footer-col">
        <div className="footer-title">Şirket</div>
        <Link href="/hakkimizda">Hakkımızda</Link>
        <a href={`mailto:${COMPANY.email}`}>İletişim</a>
        <a href="https://www.linkedin.com/company/profect-academy/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        <Link href="/kvkk">KVKK Aydınlatma Metni</Link>
        <Link href="/cerez-politikasi">Çerez Politikası</Link>
        <Link href="/icerik-bildirimi">İçerik ve Telif Bildirimi</Link>
        <CookieSettingsButton className="footer-link-btn">Çerez Tercihleri</CookieSettingsButton>
      </div>
    </footer>
  );
}

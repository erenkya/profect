import Image from "next/image";
import Link from "next/link";

export function Footer() {
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
      <div style={{ gridColumn: "span 2", minWidth: 0 }}>
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
        <Link href="/#sertifika">Sertifika doğrula</Link>
        <a href="#">Profect Plus</a>
      </div>
      <div className="footer-col">
        <div className="footer-title">Şirket</div>
        <Link href="/hakkimizda">Hakkımızda</Link>
        <a href="#">Eğitmen ol</a>
        <a href="#">İletişim</a>
      </div>
    </footer>
  );
}

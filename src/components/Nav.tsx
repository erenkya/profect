"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Corners } from "./Corners";

export function Nav() {
  const pathname = usePathname();
  const onCourses = pathname.startsWith("/kurslar");
  const onAbout = pathname.startsWith("/hakkimizda");

  return (
    <header className="nav site-nav">
      <Link href="/" style={{ marginRight: "auto", display: "flex", alignItems: "center" }} aria-label="Profect ana sayfa">
        <Image
          src="/profect-logo.jpeg"
          alt="profect"
          width={173}
          height={47}
          priority
          style={{ height: 34, width: "auto", mixBlendMode: "multiply" }}
        />
      </Link>
      <Link className="nav-link" href="/kurslar" aria-current={onCourses ? "page" : undefined}>
        Kurslar
      </Link>
      <Link className="nav-link" href="/#sertifika">
        Sertifikalar
      </Link>
      <Link className="nav-link" href="/hakkimizda" aria-current={onAbout ? "page" : undefined}>
        Hakkımızda
      </Link>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-secondary" style={{ fontSize: 15, padding: "9px 16px" }}>
          Giriş Yap
        </button>
        <Link className="btn btn-primary blueprint" href="/kurslar" style={{ padding: "9px 18px" }}>
          <Corners />
          Ücretsiz Başla
        </Link>
      </div>
    </header>
  );
}

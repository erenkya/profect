"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Corners } from "./Corners";
import { ProfileMenu } from "./ProfileMenu";
import type { SessionUser } from "@/lib/auth";

export function Nav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const onCourses = pathname.startsWith("/kurslar");
  const onAbout = pathname.startsWith("/hakkimizda");

  // Ders sayfası odaklı görünüm: üst menü gösterilmez.
  if (/^\/ogrenim\/[^/]+\/ders\//.test(pathname)) return null;

  return (
    <header className="nav site-nav">
      <Link
        href="/"
        onClick={(e) => {
          if (pathname === "/") {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }}
        style={{ marginRight: "auto", display: "flex", alignItems: "center", cursor: "pointer" }} aria-label="Profect ana sayfa">
        <Image src="/profect-logo.jpeg" alt="profect" width={173} height={47} priority style={{ height: 34, width: "auto", mixBlendMode: "multiply", cursor: "pointer" }} />
      </Link>
      <Link className="nav-link" href="/kurslar" aria-current={onCourses ? "page" : undefined}>Kurslar</Link>
      <Link className="nav-link" href="/#sertifika">Sertifikalar</Link>
      <Link className="nav-link" href="/hakkimizda" aria-current={onAbout ? "page" : undefined}>Hakkımızda</Link>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {user ? (
          <ProfileMenu user={user} />
        ) : (
          <>
            <Link className="btn btn-secondary" href="/giris" style={{ padding: "9px 16px" }}>Giriş Yap</Link>
            <Link className="btn btn-primary blueprint" href="/kurslar" style={{ padding: "9px 18px" }}>
              <Corners />
              Kursları incele
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

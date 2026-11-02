"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Corners } from "./Corners";
import { CartLink } from "./CartLink";
import { ProfileMenu } from "./ProfileMenu";
import type { SessionUser } from "@/lib/auth";

export function Nav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const onCourses = pathname.startsWith("/kurslar");
  const onPrograms = pathname.startsWith("/programlar");
  const onAbout = pathname.startsWith("/hakkimizda");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const menuId = useId();

  // Sayfa değişince kapan.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Ders sayfası odaklı görünüm: üst menü gösterilmez.
  if (/^\/ogrenim\/[^/]+\/ders\//.test(pathname)) return null;

  return (
    <header className="nav site-nav" ref={root}>
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
      <div id={menuId} className="nav-menu" data-open={open}>
        <Link className="nav-link" href="/kurslar" aria-current={onCourses ? "page" : undefined}>Kurslar</Link>
        <Link className="nav-link" href="/programlar" aria-current={onPrograms ? "page" : undefined}>Programlar</Link>
        <Link className="nav-link" href="/#sertifika">Sertifikalar</Link>
        <Link className="nav-link" href="/hakkimizda" aria-current={onAbout ? "page" : undefined}>Hakkımızda</Link>
        {!user && (
          <div className="nav-auth">
            <Link className="btn btn-secondary" href="/giris" style={{ padding: "9px 16px" }}>Giriş Yap</Link>
            <Link className="btn btn-primary blueprint" href="/kayit" style={{ padding: "9px 18px" }}>
              <Corners />
              Kayıt Ol
            </Link>
          </div>
        )}
      </div>
      <div className="nav-cart"><CartLink /></div>
      {user && <div className="nav-profile"><ProfileMenu user={user} /></div>}
      <button
        type="button"
        className="nav-burger"
        aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
    </header>
  );
}

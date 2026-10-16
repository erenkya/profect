"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Corners } from "./Corners";
import type { SessionUser } from "@/lib/auth";

export function Nav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const onCourses = pathname.startsWith("/kurslar");
  const onAbout = pathname.startsWith("/hakkimizda");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="nav site-nav">
      <Link href="/" style={{ marginRight: "auto", display: "flex", alignItems: "center" }} aria-label="Profect ana sayfa">
        <Image src="/profect-logo.jpeg" alt="profect" width={173} height={47} priority style={{ height: 34, width: "auto", mixBlendMode: "multiply" }} />
      </Link>
      <Link className="nav-link" href="/kurslar" aria-current={onCourses ? "page" : undefined}>Kurslar</Link>
      <Link className="nav-link" href="/#sertifika">Sertifikalar</Link>
      <Link className="nav-link" href="/hakkimizda" aria-current={onAbout ? "page" : undefined}>Hakkımızda</Link>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {user ? (
          <>
            {user.role === "admin" && (
              <Link className="btn btn-secondary" href="/admin" style={{ padding: "9px 16px" }}>Yönetim</Link>
            )}
            <Link className="btn btn-secondary" href="/hesabim" style={{ padding: "9px 16px" }}>
              {user.full_name.split(" ")[0]}
            </Link>
            <button className="btn btn-ghost" onClick={logout} style={{ fontSize: 15 }}>Çıkış</button>
          </>
        ) : (
          <>
            <Link className="btn btn-secondary" href="/giris" style={{ padding: "9px 16px" }}>Giriş Yap</Link>
            <Link className="btn btn-primary blueprint" href="/kayit" style={{ padding: "9px 18px" }}>
              <Corners />
              Ücretsiz Başla
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

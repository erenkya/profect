"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Genel bakış", exact: true },
  { href: "/admin/kurslar", label: "Kurslar" },
  { href: "/admin/kullanicilar", label: "Kullanıcılar" },
  { href: "/admin/kayitlar", label: "Kayıtlar" },
  { href: "/admin/siparisler", label: "Siparişler" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="admin-tabs" aria-label="Yönetim">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href) || (t.href === "/admin/kurslar" && pathname.startsWith("/admin/sinav"));
        return (
          <Link key={t.href} href={t.href} className={active ? "btn btn-primary" : "btn btn-secondary"} aria-current={active ? "page" : undefined} style={{ fontSize: 15, padding: "8px 16px" }}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ACCOUNT_ITEMS, isActiveItem } from "./items";

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="acc-nav" aria-label="Hesabım">
      {ACCOUNT_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActiveItem(pathname, item);
        return (
          <Link key={item.href} href={item.href} className="acc-link" aria-current={active ? "page" : undefined}>
            <Icon size={17} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

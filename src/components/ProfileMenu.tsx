"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { ACCOUNT_ITEMS, isActiveItem } from "@/components/account/items";
import type { SessionUser } from "@/lib/auth";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toLocaleUpperCase("tr-TR");
}

export function ProfileMenu({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  // Sayfa değişince kapan.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  function items() {
    return Array.from(root.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    setOpen(true);
    // Panel `inert` iken odaklanamaz; açılma commit'inden sonra odakla.
    requestAnimationFrame(() => {
      const list = items();
      (e.key === "ArrowDown" ? list[0] : list[list.length - 1])?.focus();
    });
  }

  function onPanelKey(e: React.KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % list.length;
    else if (e.key === "ArrowUp") next = (i - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else return;
    e.preventDefault();
    list[next]?.focus();
  }

  async function logout() {
    close();
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const first = user.full_name.split(" ")[0];

  return (
    <div className="pm" ref={root} onBlur={(e) => open && e.relatedTarget && !root.current?.contains(e.relatedTarget as Node) && close()}>
      <button
        ref={trigger}
        type="button"
        className="pm-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        <span className="pm-avatar" aria-hidden="true">{initials(user.full_name)}</span>
        <span className="pm-name">{first}</span>
        <ChevronDown size={16} className="pm-chev" aria-hidden="true" />
      </button>

      <div id={panelId} className="pm-panel" role="menu" aria-label="Hesap menüsü" data-open={open} inert={!open} onKeyDown={onPanelKey}>
        <div className="pm-head">
          <span className="pm-avatar pm-avatar-lg" aria-hidden="true">{initials(user.full_name)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="pm-head-name">{user.full_name}</div>
            <div className="pm-head-mail">{user.email}</div>
          </div>
        </div>

        <div className="pm-list">
          {ACCOUNT_ITEMS.map((item, i) => {
            const Icon = item.icon;
            const active = isActiveItem(pathname, item);
            return (
              <Link key={item.href} href={item.href} role="menuitem" className="pm-item" style={{ "--i": i } as React.CSSProperties} aria-current={active ? "page" : undefined}>
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="pm-list pm-foot">
          {user.role === "admin" && (
            <Link href="/admin" role="menuitem" className="pm-item" style={{ "--i": ACCOUNT_ITEMS.length } as React.CSSProperties}>
              <ShieldCheck size={17} aria-hidden="true" />
              Yönetim paneli
            </Link>
          )}
          <button type="button" role="menuitem" className="pm-item pm-logout" style={{ "--i": ACCOUNT_ITEMS.length + 1 } as React.CSSProperties} onClick={logout}>
            <LogOut size={17} aria-hidden="true" />
            Çıkış yap
          </button>
        </div>
      </div>
    </div>
  );
}

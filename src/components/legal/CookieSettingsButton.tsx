"use client";

import { openCookieSettings } from "@/components/CookieConsent";

/** Çerez tercih panelini açan metin bağlantısı (alt bilgi ve Çerez Politikası sayfası için). */
export function CookieSettingsButton({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={openCookieSettings}
      className={className}
      style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", color: "inherit", textAlign: "left" }}
    >
      {children}
    </button>
  );
}

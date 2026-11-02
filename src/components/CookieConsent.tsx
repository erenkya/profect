"use client";

import Link from "next/link";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_DAYS,
  parseConsent,
  readCookieValue,
  serializeConsent,
  type Consent,
} from "@/lib/consent";

// Tercih tek bir birinci taraf çerezde tutulur (bkz. lib/consent.ts). Analitik/pazarlama betikleri eklendiğinde
// yalnızca `useConsent().consent?.analytics === true` iken yüklenmelidir.

let cache: { raw: string | null; consent: Consent | null } = { raw: null, consent: null };
let settingsOpen = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function readConsent(): Consent | null {
  const raw = readCookieValue(document.cookie, CONSENT_COOKIE);
  if (raw !== cache.raw) cache = { raw, consent: parseConsent(raw) };
  return cache.consent;
}

function saveConsent(analytics: boolean) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(analytics)}; Max-Age=${CONSENT_MAX_AGE_DAYS * 86400}; Path=/; SameSite=Lax${secure}`;
  settingsOpen = false;
  notify();
}

/** Alt bilgideki "Çerez Tercihleri" bağlantısı: kayıtlı tercihi değiştirmek için paneli yeniden açar. */
export function openCookieSettings() {
  settingsOpen = true;
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useConsent() {
  const consent = useSyncExternalStore(subscribe, readConsent, () => null);
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const open = useSyncExternalStore(subscribe, () => settingsOpen, () => false);
  return { consent, ready, open };
}

// "Kabul et / Reddet / Tercihler" düğmeleri KVKK Rehberi'ndeki iyi uygulama gereği renk, boyut ve punto
// bakımından eşit tutulur: üçü de aynı sınıf ve aynı stili kullanır.
const choiceBtn = { flex: "1 1 120px", whiteSpace: "nowrap" } as const;

export function CookieConsent() {
  const { consent, ready, open } = useConsent();
  const [wantsDetails, setWantsDetails] = useState(false);
  const [draft, setDraft] = useState<boolean | null>(null);
  const titleId = useId();

  const visible = ready && (consent === null || open);
  const details = open || wantsDetails;
  const analytics = draft ?? consent?.analytics ?? false;

  useEffect(() => {
    if (!visible || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        settingsOpen = false;
        notify();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, open]);

  if (!visible) return null;

  function choose(value: boolean) {
    saveConsent(value);
    setWantsDetails(false);
    setDraft(null);
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={{
        position: "fixed",
        insetInline: 16,
        bottom: 16,
        zIndex: 1000,
        maxWidth: 640,
        marginInline: "auto 0",
        background: "var(--color-bg, #fff)",
        color: "var(--color-text)",
        border: "1px solid var(--color-divider)",
        borderRadius: "var(--radius-md, 6px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        padding: 20,
        fontSize: 14,
        lineHeight: 1.55,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        maxHeight: "calc(100dvh - 32px)",
        overflowY: "auto",
      }}
    >
      <h2 id={titleId} style={{ fontSize: 18, margin: 0 }}>Çerez tercihleriniz</h2>
      <p style={{ margin: 0 }}>
        Profect’te oturumunuzu, sepetinizi ve güvenliğinizi sağlayan zorunlu çerezler kullanırız; bunlar için onayınız gerekmez.
        Siteyi nasıl kullandığınızı ölçen analitik çerezler ise yalnızca izin verirseniz çalışır. Tercihinizi dilediğiniz zaman alt bilgideki
        “Çerez Tercihleri” bağlantısından değiştirebilirsiniz. Ayrıntılar için{" "}
        <Link href="/cerez-politikasi">Çerez Politikası</Link> ve <Link href="/kvkk">KVKK Aydınlatma Metni</Link>’ni inceleyebilirsiniz.
      </p>

      {details && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", opacity: 0.8 }}>
            <input type="checkbox" checked disabled style={{ marginTop: 4 }} />
            <span>
              <strong>Zorunlu çerezler</strong> — Giriş oturumu, sepet, güvenlik doğrulaması ve bu tercihin kendisi. Her zaman açıktır.
            </span>
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={analytics} onChange={(e) => setDraft(e.target.checked)} style={{ marginTop: 4 }} />
            <span>
              <strong>Analitik çerezler</strong> — Sitenin kullanımını ölçmemize ve geliştirmemize yardımcı olur. Şu an sitede kullanılmamaktadır;
              ileride eklenirse yalnızca bu izinle çalışır.
            </span>
          </label>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn btn-secondary" style={choiceBtn} onClick={() => choose(true)}>
          {details ? "Tümünü Kabul Et" : "Kabul Et"}
        </button>
        <button type="button" className="btn btn-secondary" style={choiceBtn} onClick={() => choose(false)}>
          {details ? "Tümünü Reddet" : "Reddet"}
        </button>
        {details ? (
          <button type="button" className="btn btn-secondary" style={choiceBtn} onClick={() => choose(analytics)}>
            Seçimi Kaydet
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" style={choiceBtn} onClick={() => setWantsDetails(true)}>
            Tercihler
          </button>
        )}
      </div>
    </div>
  );
}

// Çerez tercihi: KVKK Çerez Uygulamaları Rehberi gereği zorunlu olmayan çerezler varsayılan olarak kapalıdır
// ve yalnızca kullanıcının aktif seçimiyle açılır. Tercih, kullanıcıya ait birinci taraf bir çerezde tutulur.
// Bu dosya tarayıcı/sunucu bağımsız saf mantıktır (test edilebilir); depolama ve React bağlantısı
// components/CookieConsent.tsx içindedir.

export const CONSENT_COOKIE = "profect_consent";
/** Çerez kategorileri veya metin anlamı değiştiğinde artırılır; eski tercihler geçersiz sayılıp yeniden sorulur. */
export const CONSENT_VERSION = 1;
/** Rıza yorgunluğunu önlemek için her girişte değil, bu sürede bir kez hatırlatılır. */
export const CONSENT_MAX_AGE_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

export type Consent = {
  v: number;
  /** Zorunlu olmayan analitik/performans çerezleri. */
  analytics: boolean;
  /** Tercihin verildiği an (ms). Rıza kaydı olarak da kullanılır. */
  at: number;
};

export function serializeConsent(analytics: boolean, now: number = Date.now()): string {
  const value: Consent = { v: CONSENT_VERSION, analytics, at: now };
  return encodeURIComponent(JSON.stringify(value));
}

/** Geçerli (doğru sürüm, süresi dolmamış) tercihi döndürür; yoksa ya da bozuksa null. */
export function parseConsent(raw: string | null | undefined, now: number = Date.now()): Consent | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(decodeURIComponent(raw));
    if (!data || typeof data !== "object") return null;
    const { v, analytics, at } = data as Record<string, unknown>;
    if (v !== CONSENT_VERSION || typeof analytics !== "boolean" || typeof at !== "number") return null;
    if (at > now + DAY_MS || now - at > CONSENT_MAX_AGE_DAYS * DAY_MS) return null;
    return { v, analytics, at };
  } catch {
    return null;
  }
}

/** `document.cookie` dizgesinden tek bir çerezin ham değerini çıkarır. */
export function readCookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq > -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

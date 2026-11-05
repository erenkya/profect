// Eğitim son tarihi (süre) kuralları. DB'de UTC `DATETIME` ("YYYY-MM-DD HH:mm:ss"); arayüzde Türkiye saati girilir ve gösterilir.
// Türkiye 2016'dan beri yıl boyu UTC+3'tür (yaz/kış saati yok), bu yüzden sabit ofset yeterlidir.
// `server-only` içermez; node --test ile doğrudan yüklenebilir.
import { z } from "zod";

const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** Bu süreden az kaldıysa "yaklaşıyor" sayılır. */
export const DUE_SOON_MS = 3 * 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

function toUtcString(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** DB'deki UTC metnini epoch ms'ye çevirir. */
export function utcMs(utc: string): number {
  return Date.parse(`${utc.replace(" ", "T")}Z`);
}

/** Tarayıcının `datetime-local` değeri ("2026-11-05T14:30", Türkiye saati) → DB'deki UTC metni; geçersizse null. */
export function istanbulToUtc(local: string): string | null {
  const m = LOCAL_RE.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = new Date(Date.UTC(y, mo - 1, d, h, mi));
  // 31 Şubat gibi taşan tarihleri reddet.
  if (asUtc.getUTCFullYear() !== y || asUtc.getUTCMonth() !== mo - 1 || asUtc.getUTCDate() !== d || asUtc.getUTCHours() !== h || asUtc.getUTCMinutes() !== mi) return null;
  return toUtcString(asUtc.getTime() - TR_OFFSET_MS);
}

/** DB'deki UTC metni → `datetime-local` girdisinin değeri (Türkiye saati). */
export function utcToIstanbulInput(utc: string): string {
  const d = new Date(utcMs(utc) + TR_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const formatter = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" });

/** "5 Kas 2026 14:30" biçiminde, Türkiye saatiyle. */
export const formatIstanbul = (utc: string): string => formatter.format(new Date(utcMs(utc)));

/** Çalışana özel süre ile eğitim geneli süreden erken olanı geçerlidir; boş olan yok sayılır. */
export function effectiveDue(personal: string | null, course: string | null): string | null {
  if (personal && course) return personal <= course ? personal : course;
  return personal ?? course ?? null;
}

export type DueState = "none" | "ok" | "soon" | "overdue";

export function dueState(due: string | null, nowMs: number): DueState {
  if (!due) return "none";
  const left = utcMs(due) - nowMs;
  if (left <= 0) return "overdue";
  return left <= DUE_SOON_MS ? "soon" : "ok";
}

/** Yeni verilen bir süre geçmişte olamaz (verildiği anda erişimi kapatırdı). */
export function dueBlock(utc: string, nowMs: number): "past" | null {
  return utcMs(utc) <= nowMs ? "past" : null;
}

export function remainingLabel(due: string, nowMs: number): string {
  const left = utcMs(due) - nowMs;
  if (left <= 0) return "Süresi doldu";
  const minutes = Math.floor(left / 60_000);
  if (minutes >= 24 * 60) return `${Math.floor(minutes / (24 * 60))} gün kaldı`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} saat kaldı`;
  return `${Math.max(1, minutes)} dakika kaldı`;
}

export const isUtcString = (v: unknown): v is string => typeof v === "string" && UTC_RE.test(v);

/** API girdisi: Türkiye saatiyle `datetime-local` metni; boş ya da null "süreyi kaldır" demektir. Çıktı UTC metni ya da null. */
export const dueInputSchema = z
  .string()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v.trim() === "") return null;
    const utc = istanbulToUtc(v);
    if (!utc) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tarih ve saat geçersiz." });
      return z.NEVER;
    }
    return utc;
  });

export const DUE_PAST_MESSAGE = "Son tarih geçmişte olamaz.";

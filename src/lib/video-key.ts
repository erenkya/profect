// R2 video nesne anahtarları: üretim ve doğrulama. Saf fonksiyonlar (Node test edilebilir, sunucu bağımlılığı yok).
import { slugify as baseSlugify } from "./format.ts";

export const MAX_VIDEO_BYTES = 2_147_483_648; // 2 GB
export const VIDEO_CHUNK_BYTES = 4_194_304; // 4 MiB — tek yanıtta en çok bu kadar akıtılır
export const QUOTA_MULTIPLIER = 5; // kullanıcı × ders × gün: video boyutunun 5 katı

const KEY_RE = /^kurslar\/[a-z0-9-]+\/[0-9]+-[a-z0-9-]+\/[a-f0-9]{8}-[a-z0-9-]+\.mp4$/;

/** Klasör/dosya adı için ASCII slug (en çok 40 karakter); harf/rakam yoksa `fallback`. */
export function slugify(input: string, fallback: string): string {
  return baseSlugify(input).slice(0, 40).replace(/-+$/, "") || fallback;
}

export function moduleFolder(courseSlug: string, moduleId: number, moduleTitle: string): string {
  return `kurslar/${courseSlug}/${moduleId}-${slugify(moduleTitle, "modul")}/`;
}

export function buildVideoKey(courseSlug: string, moduleId: number, moduleTitle: string, lessonTitle: string, random: string): string {
  return `${moduleFolder(courseSlug, moduleId, moduleTitle)}${random}-${slugify(lessonTitle, "ders")}.mp4`;
}

export function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function isVideoKey(key: string): boolean {
  return KEY_RE.test(key);
}

/** Anahtar geçerli biçimde ve verilen kurs/modül klasörünün altında mı? */
export function keyInModule(key: string, courseSlug: string, moduleId: number): boolean {
  return isVideoKey(key) && key.startsWith(`kurslar/${courseSlug}/${moduleId}-`);
}

/** Bugün akıtılan bayt, videonun `QUOTA_MULTIPLIER` katına ulaştıysa kota dolmuştur. */
export function isQuotaExceeded(usedBytes: number, totalBytes: number): boolean {
  return usedBytes >= QUOTA_MULTIPLIER * totalBytes;
}

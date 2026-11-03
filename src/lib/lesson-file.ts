// Ders dosyaları (indirilebilir ekler): R2 anahtarı, ad temizleme ve doğrulama. Saf fonksiyonlar (Node test edilebilir, sunucu bağımlılığı yok).
import { slugify } from "./video-key.ts";

export const MAX_LESSON_FILE_BYTES = 157_286_400; // 150 MiB

export const BLOCKED_EXTENSIONS: readonly string[] = ["exe", "msi", "bat", "cmd", "com", "scr", "sh", "ps1", "vbs", "jar", "app", "dmg", "apk"];

const KEY_RE = /^dosyalar\/([0-9]+)\/[a-f0-9]{8}-[a-z0-9-]+(\.[a-z0-9]{1,10})?$/;
const MAX_NAME = 255;

/** Yol ayırıcıları, kontrol karakterleri ve baştaki/sondaki boşluk-nokta atılır; en çok 255 karakter (uzantı korunur); boşsa "dosya". */
export function cleanFileName(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? "";
  const cleaned = last.replace(/[\u0000-\u001f\u007f]/g, "").replace(/^\s+/, "").replace(/[\s.]+$/, "");
  if (!cleaned) return "dosya";
  if (cleaned.length <= MAX_NAME) return cleaned;
  const ext = /\.[A-Za-z0-9]{1,10}$/.exec(cleaned)?.[0] ?? "";
  return cleaned.slice(0, MAX_NAME - ext.length) + ext;
}

/** Son uzantı (küçük harf, noktasız); yoksa "". Baştaki nokta (".gitignore") uzantı sayılmaz. */
export function fileExtension(name: string): string {
  const n = cleanFileName(name);
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(i + 1).toLowerCase() : "";
}

export function isBlockedFileName(name: string): boolean {
  return BLOCKED_EXTENSIONS.includes(fileExtension(name));
}

export function buildLessonFileKey(lessonId: number, fileName: string, random: string): string {
  const name = cleanFileName(fileName);
  const ext = fileExtension(name);
  const safeExt = /^[a-z0-9]{1,10}$/.test(ext) ? ext : "";
  const base = ext ? name.slice(0, name.lastIndexOf(".")) : name;
  return `dosyalar/${lessonId}/${random}-${slugify(base, "dosya")}${safeExt ? `.${safeExt}` : ""}`;
}

export function isLessonFileKey(key: string): boolean {
  return KEY_RE.test(key);
}

/** Anahtar geçerli biçimde ve bu derse mi ait? (ders ID'si tam sayı olarak eşleşir, önek eşleşmesi değil) */
export function lessonFileKeyForLesson(key: string, lessonId: number): boolean {
  const m = KEY_RE.exec(key);
  return !!m && Number(m[1]) === lessonId;
}

/** İndirme başlığı: ASCII yedek ad + RFC 5987 UTF-8 ad. Kullanıcı adı başlığı bozamaz (tırnak, `;`, satır sonu temizlenir/kodlanır). */
export function contentDispositionAttachment(fileName: string): string {
  const name = cleanFileName(fileName);
  const fallback = name.replace(/[^A-Za-z0-9._ -]/g, "_");
  const utf8 = encodeURIComponent(name).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${utf8}`;
}

/** 850 → "850 B", 1536 → "1,5 KB", 2516582 → "2,4 MB" (1024 tabanlı, Türkçe ondalık virgül). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const one = (n: number) => n.toFixed(1).replace(".", ",");
  return bytes < 1_048_576 ? `${one(bytes / 1024)} KB` : `${one(bytes / 1_048_576)} MB`;
}

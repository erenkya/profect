// Kurs kapak resmi: R2 nesne anahtarları ve doğrulama. Saf fonksiyonlar (Node test edilebilir, sunucu bağımlılığı yok).

export const MAX_COVER_BYTES = 5_242_880; // 5 MB

export const COVER_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type CoverType = keyof typeof COVER_TYPES;

const KEY_RE = /^kapaklar\/([0-9]+)-[a-f0-9]{8}\.(jpg|png|webp)$/;
const CONTENT_TYPE_BY_EXT: Record<string, CoverType> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function isCoverType(type: string): type is CoverType {
  return type in COVER_TYPES;
}

export function buildCoverKey(courseId: number, type: CoverType, random: string): string {
  return `kapaklar/${courseId}-${random}.${COVER_TYPES[type]}`;
}

export function isCoverKey(key: string): boolean {
  return KEY_RE.test(key);
}

/** Anahtar geçerli biçimde ve bu kursa mı ait? */
export function coverKeyForCourse(key: string, courseId: number): boolean {
  const m = KEY_RE.exec(key);
  return !!m && Number(m[1]) === courseId;
}

export function coverContentType(key: string): CoverType | null {
  const m = KEY_RE.exec(key);
  return m ? CONTENT_TYPE_BY_EXT[m[2]] : null;
}

/** Tarayıcıda gösterilecek adres. Anahtar rastgele içerdiği için içerik değişince adres de değişir. */
export function coverUrl(key: string | null | undefined): string | null {
  return key && isCoverKey(key) ? `/api/kapak/${key.slice("kapaklar/".length)}` : null;
}

/** `/api/kapak/<ad>` adresindeki ada karşılık gelen R2 anahtarı; geçersizse null. */
export function coverKeyFromName(name: string): string | null {
  const key = `kapaklar/${name}`;
  return isCoverKey(key) ? key : null;
}

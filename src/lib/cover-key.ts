// Kurs ve program kapak resmi: R2 nesne anahtarları ve doğrulama. Saf fonksiyonlar (Node test edilebilir, sunucu bağımlılığı yok).

export const MAX_COVER_BYTES = 5_242_880; // 5 MB

export const COVER_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type CoverType = keyof typeof COVER_TYPES;

// Kurs: kapaklar/<id>-…  ·  Program: kapaklar/p<id>-…  (iki id uzayı çakışmasın diye program anahtarı "p" önekli)
const KEY_RE = /^kapaklar\/(p?)([0-9]+)-[a-f0-9]{8}\.(jpg|png|webp)$/;
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

export function buildProgramCoverKey(programId: number, type: CoverType, random: string): string {
  return `kapaklar/p${programId}-${random}.${COVER_TYPES[type]}`;
}

/** Anahtar geçerli biçimde ve bu kursa mı ait? */
export function coverKeyForCourse(key: string, courseId: number): boolean {
  const m = KEY_RE.exec(key);
  return !!m && m[1] === "" && Number(m[2]) === courseId;
}

/** Anahtar geçerli biçimde ve bu programa mı ait? */
export function coverKeyForProgram(key: string, programId: number): boolean {
  const m = KEY_RE.exec(key);
  return !!m && m[1] === "p" && Number(m[2]) === programId;
}

export function coverContentType(key: string): CoverType | null {
  const m = KEY_RE.exec(key);
  return m ? CONTENT_TYPE_BY_EXT[m[3]] : null;
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

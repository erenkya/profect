// Blog/haber görselleri: R2 nesne anahtarları ve doğrulama. Saf fonksiyonlar (Node test edilebilir, sunucu bağımlılığı yok).

export const MAX_POST_IMAGE_BYTES = 8_388_608; // 8 MB

export const POST_IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;
export type PostImageType = keyof typeof POST_IMAGE_TYPES;

const KEY_RE = /^gorseller\/([a-f0-9]{16})\.(jpg|png|webp|gif)$/;
const CONTENT_TYPE_BY_EXT: Record<string, PostImageType> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const URL_RE = /\/api\/gorsel\/([a-f0-9]{16}\.(?:jpg|png|webp|gif))/g;

export function isPostImageType(type: string): type is PostImageType {
  return type in POST_IMAGE_TYPES;
}

export function buildPostImageKey(type: PostImageType, random: string): string {
  return `gorseller/${random}.${POST_IMAGE_TYPES[type]}`;
}

export function isPostImageKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function postImageContentType(key: string): PostImageType | null {
  const m = KEY_RE.exec(key);
  return m ? CONTENT_TYPE_BY_EXT[m[2]] : null;
}

/** Tarayıcıda gösterilecek adres. Anahtar rastgele olduğu için içerik değişince adres de değişir. */
export function postImageUrl(key: string | null | undefined): string | null {
  return key && isPostImageKey(key) ? `/api/gorsel/${key.slice("gorseller/".length)}` : null;
}

/** `/api/gorsel/<ad>` adresindeki ada karşılık gelen R2 anahtarı; geçersizse null. */
export function postImageKeyFromName(name: string): string | null {
  const key = `gorseller/${name}`;
  return isPostImageKey(key) ? key : null;
}

/** Markdown içinde kullanılan (ve kapaktaki) tüm görsel anahtarları; yazı silinirken R2'den temizlenir. */
export function extractPostImageKeys(markdown: string, cover?: string | null): string[] {
  const keys = new Set<string>();
  for (const m of markdown.matchAll(URL_RE)) keys.add(`gorseller/${m[1]}`);
  if (cover && isPostImageKey(cover)) keys.add(cover);
  return [...keys];
}

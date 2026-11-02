// Blog ve haber tek tabloda tutulur; `type` hangi bölümde görüneceğini belirler.

export const POST_TYPES = {
  blog: { label: "Blog", plural: "Blog yazıları", path: "/blog", empty: "Henüz blog yazısı yok." },
  news: { label: "Haber", plural: "Haberler", path: "/haberler", empty: "Henüz haber yok." },
} as const;

export type PostType = keyof typeof POST_TYPES;

export function isPostType(value: string): value is PostType {
  return value in POST_TYPES;
}

export function postHref(type: PostType, slug: string): string {
  return `${POST_TYPES[type].path}/${slug}`;
}

/** "2026-10-05 09:00:00" → "5 Ekim 2026". Saklanan değer saat dilimi içermez; sunucu saatinden bağımsız okunur. */
export function formatPostDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value.replace(" ", "T").slice(0, 19) + "Z");
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

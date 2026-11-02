// Markdown yardımcıları: .md dosyasından yazı alanlarını çıkarma, özet ve okuma süresi. Saf fonksiyonlar.

export type ParsedMarkdownFile = {
  title: string;
  excerpt: string;
  author: string;
  type: "blog" | "news" | null;
  publishedAt: string | null; // "YYYY-MM-DDTHH:mm"
  cover: string | null;
  content: string;
};

const unquote = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, "$2");

/**
 * Bir .md dosyasını yazı alanlarına ayırır. Dosyanın başında `---` ile çevrili basit `anahtar: değer` satırları
 * (title, excerpt/summary/description, author, type, date, cover) varsa okunur; başlık yoksa ilk `# Başlık` satırı
 * başlık olur ve içerikten çıkarılır.
 */
export function parseMarkdownFile(raw: string): ParsedMarkdownFile {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const meta: Record<string, string> = {};
  const fm = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (m) meta[m[1].toLowerCase()] = unquote(m[2]);
    }
    text = text.slice(fm[0].length);
  }
  text = text.replace(/^\n+/, "");

  let title = meta.title ?? "";
  if (!title) {
    const h1 = /^#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/.exec(text);
    if (h1) {
      title = h1[1].trim();
      text = text.slice(h1[0].length).replace(/^\n+/, "");
    }
  }

  const type = meta.type === "blog" || meta.type === "news" ? meta.type : meta.type === "haber" ? "news" : null;
  const date = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(meta.date ?? meta.published_at ?? "");
  return {
    title,
    excerpt: meta.excerpt ?? meta.summary ?? meta.description ?? "",
    author: meta.author ?? "",
    type,
    publishedAt: date ? `${date[1]}T${date[2] ?? "09:00"}` : null,
    cover: meta.cover ?? null,
    content: text.replace(/\s+$/, "") + "\n",
  };
}

/** Markdown sözdizimini ayıklayıp ilk `max` karakterlik düz bir özet üretir (kelime ortasında kesmez). */
export function excerptFromMarkdown(markdown: string, max = 180): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*(?:#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s,.;:–-]+$/, "") + "…";
}

/** Dakikada ~200 kelimeyle okuma süresi (en az 1). */
export function readingMinutes(markdown: string): number {
  const words = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** Listelerde içerik taşımamak için karakter sayısından yaklaşık okuma süresi. */
export function readingMinutesFromChars(chars: number): number {
  return Math.max(1, Math.ceil(chars / 1300));
}

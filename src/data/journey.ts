// Ana sayfadaki "kariyer yolculuğu" içerikleri. Saf veri: `@/` import'u yok (birim test `./` ile alır).

export const STAGES = [
  { key: "bilgi", en: "Knowledge", tr: "Bilgi" },
  { key: "karar", en: "Decision", tr: "Karar" },
  { key: "etki", en: "Impact", tr: "Etki" },
] as const;

export type AgendaIcon = "trending-down" | "shield-check" | "users" | "sparkles" | "target" | "bar-chart";

/** "Bunlardan hangisi sizin gündeminizde?" kartları. Problem ifadesidir, belirli bir eğitimin vaadi değildir. */
export const AGENDA: readonly { id: string; label: string; icon: AgendaIcon }[] = [
  { id: "maliyet", label: "Maliyetleri düşürmek", icon: "trending-down" },
  { id: "tedarikci-riski", label: "Tedarikçi riskini yönetmek", icon: "shield-check" },
  { id: "muzakere", label: "Daha iyi müzakere etmek", icon: "users" },
  { id: "yapay-zeka", label: "AI'ı işimde kullanmak", icon: "sparkles" },
  { id: "strateji", label: "Stratejik karar almak", icon: "target" },
  { id: "veri", label: "Veriden daha iyi yararlanmak", icon: "bar-chart" },
];
export const AGENDA_HREF = "/kurslar";

/** Kurucu alıntıları: anahtar `FOUNDERS[].n`. Yalnızca kurucuların onayladığı metin girilir; boşsa gösterilmez. */
export const FOUNDER_QUOTES: Record<string, string> = {};

/** Referans logoları: logo dosyası ve kullanım izni gelince doldurulur; boşsa bölüm render edilmez. */
export const REFERENCE_LOGOS: { name: string; src: string; width: number; height: number }[] = [];

export function quoteFor(n: string): string | null {
  const q = FOUNDER_QUOTES[n]?.trim();
  return q ? q : null;
}

export function hasReferences(list: readonly unknown[] = REFERENCE_LOGOS): boolean {
  return list.length > 0;
}

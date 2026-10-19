/** 1490 → "₺1.490" */
export function formatPrice(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return "₺" + new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

/** Kutuya sertifika numarası ya da sertifika linki (…/sertifika/PRF-2026-000001) girilebilir; numarayı ayıklar. */
export function extractCertCode(input: string): string {
  const text = input.trim();
  const m = text.match(/(?:^|\/)sertifika\/([^/?#\s]+)/i);
  if (!m) return text;
  try {
    return decodeURIComponent(m[1]).trim();
  } catch {
    return m[1];
  }
}

/** 135 → "2 saat 15 dk", 60 → "1 saat", 45 → "45 dk" */
export function formatDuration(totalMinutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(totalMinutes ?? 0)));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h} saat ${rest} dk`;
  if (h) return `${h} saat`;
  return `${rest} dk`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value.replace(" ", "T") + (value.includes("T") ? "" : "Z"));
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function slugify(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/** 1490 → "₺1.490" */
export function formatPrice(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return "₺" + new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
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

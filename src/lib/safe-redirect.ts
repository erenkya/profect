/** Açık yönlendirme (open redirect) önlemi: yalnızca site içi mutlak yollar. */
export function safeNext(next: string | null | undefined, fallback = "/hesabim"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

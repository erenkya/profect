import "server-only";
import { getProgramOffer, listPublishedPrograms } from "@/lib/programs";

/** Şirketin kontenjan satın alabileceği programlar: yayında, satılabilir (kursları yayında + final sınavlı) ve ücretli. Fiyat kullanıcıya özel değildir. */
export async function listBuyablePrograms(): Promise<{ id: number; title: string; slug: string }[]> {
  const published = await listPublishedPrograms();
  const offers = await Promise.all(published.map((p) => getProgramOffer(p.slug, null)));
  return offers.flatMap((o) => (o && o.sellable && o.calc.effectivePrice > 0 ? [{ id: o.program.id, title: o.program.title, slug: o.program.slug }] : []));
}

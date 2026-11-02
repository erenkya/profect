// Program (kurs paketi) fiyatının saf (DB/ağ içermeyen) hesabı. `server-only` içermez; node --test ile yüklenebilir.
//
// S = kursların güncel liste fiyatları toplamı, B' = min(B, S), r = B'/S (S = 0 ise 1).
// kredi = round2(edinilmiş liste toplamı × r); ödenecek = B' − kredi (0 ≤ ödenecek ≤ B', ≤ edinilmemiş liste toplamı).

export type ProgramCourseInput = { id: number; price: number };

export type ProgramPriceLine = {
  id: number;
  listPrice: number;
  /** `round2(listPrice × ratio)` — kalem satırında gösterilen indirimli fiyat. */
  price: number;
  owned: boolean;
};

export type ProgramQuoteCalc = {
  /** S: kursların liste fiyatları toplamı. */
  listTotal: number;
  /** B: adminin kaydettiği program fiyatı. */
  programPrice: number;
  /** B' = min(B, S). */
  effectivePrice: number;
  ratio: number;
  credit: number;
  payable: number;
  ownedCount: number;
  lines: ProgramPriceLine[];
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function priceProgram(
  programPrice: number,
  courses: readonly ProgramCourseInput[],
  ownedIds: ReadonlySet<number>,
): ProgramQuoteCalc {
  const listTotal = round2(courses.reduce((s, c) => s + c.price, 0));
  const effectivePrice = round2(Math.min(programPrice, listTotal));
  const ratio = listTotal === 0 ? 1 : effectivePrice / listTotal;

  const owned = courses.filter((c) => ownedIds.has(c.id));
  const ownedList = owned.reduce((s, c) => s + c.price, 0);
  const unownedList = round2(courses.reduce((s, c) => s + (ownedIds.has(c.id) ? 0 : c.price), 0));

  const credit = round2(ownedList * ratio);
  const payable = Math.max(0, Math.min(round2(effectivePrice - credit), unownedList));

  return {
    listTotal,
    programPrice,
    effectivePrice,
    ratio,
    credit,
    payable,
    ownedCount: owned.length,
    lines: courses.map((c) => ({
      id: c.id,
      listPrice: c.price,
      price: round2(c.price * ratio),
      owned: ownedIds.has(c.id),
    })),
  };
}

/** Programları verilen sırayla fiyatlar; her program, öncekilerin kurslarını edinilmiş sayar (çift ödeme yok). */
export function priceProgramsInOrder(
  programs: readonly { price: number; courses: readonly ProgramCourseInput[] }[],
  ownedIds: ReadonlySet<number>,
): ProgramQuoteCalc[] {
  const owned = new Set(ownedIds);
  return programs.map((p) => {
    const q = priceProgram(p.price, p.courses, owned);
    for (const c of p.courses) owned.add(c.id);
    return q;
  });
}

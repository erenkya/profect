// Yönetici sınav editörünün durum tipleri ve tip dönüşümleri. Saf modül.

export type Opt = { option_text: string; is_correct: boolean };
export type ChoiceQ = { kind: "single" | "multiple"; question_text: string; explanation: string; options: Opt[] };
export type CatQ = { kind: "categorize"; question_text: string; explanation: string; categories: string[]; cards: { card_text: string; category_index: number }[] };
export type ScenQ = { kind: "scenario"; scenario_text: string; scenario_prompt: string; questions: ChoiceQ[] };
export type EditorItem = ChoiceQ | CatQ | ScenQ;
export type ItemKind = "single" | "multiple" | "categorize";

export const blankChoice = (kind: ChoiceQ["kind"] = "single"): ChoiceQ => ({
  kind,
  question_text: "",
  explanation: "",
  options: [{ option_text: "", is_correct: true }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }],
});

export const blankCategorize = (): CatQ => ({
  kind: "categorize",
  question_text: "",
  explanation: "",
  categories: ["", ""],
  cards: [{ card_text: "", category_index: 0 }, { card_text: "", category_index: 1 }],
});

/** Tek ↔ çok cevaplı geçişi: tek cevaplıya dönerken yalnızca ilk doğru şık korunur. */
export function switchChoiceKind(q: ChoiceQ, kind: ChoiceQ["kind"]): ChoiceQ {
  if (kind === q.kind) return q;
  if (kind === "multiple") return { ...q, kind };
  const first = q.options.findIndex((o) => o.is_correct);
  return { ...q, kind, options: q.options.map((o, k) => ({ ...o, is_correct: k === Math.max(first, 0) })) };
}

const pad = <T,>(items: T[], min: number, blank: () => T) => [...items, ...Array.from({ length: Math.max(0, min - items.length) }, blank)];

/**
 * Soru tipi değişimi: metin ve açıklama korunur; şık metinleri kart, kart metinleri şık olur
 * (yanlışlıkla tip değiştirip geri dönen yönetici yazdıklarını kaybetmez).
 */
export function changeKind(q: ChoiceQ | CatQ, kind: ItemKind): ChoiceQ | CatQ {
  if (kind === q.kind) return q;
  const base = { question_text: q.question_text, explanation: q.explanation };
  if (kind === "categorize") {
    const texts = (q as ChoiceQ).options.map((o) => o.option_text).filter((t) => t.trim());
    return { ...blankCategorize(), ...base, cards: pad(texts.map((card_text) => ({ card_text, category_index: -1 })), 2, () => ({ card_text: "", category_index: -1 })) };
  }
  if (q.kind === "categorize") {
    const texts = q.cards.map((c) => c.card_text).filter((t) => t.trim());
    const options = pad(texts.map((option_text) => ({ option_text, is_correct: false })), 2, () => ({ option_text: "", is_correct: false }));
    if (kind === "single") options[0] = { ...options[0], is_correct: true };
    return { kind, ...base, options };
  }
  return switchChoiceKind(q, kind);
}

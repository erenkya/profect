// Yönetici sınav editörünün durum tipleri ve tip dönüşümleri. Saf modül.

import type { z } from "zod";
import type { quizSchema } from "./admin-schemas.ts";
import { POOL_KINDS, type PoolConfig, type PoolKind } from "./quiz-pool.ts";

export type Opt = { option_text: string; is_correct: boolean };
export type ChoiceQ = { kind: "single" | "multiple"; question_text: string; explanation: string; is_required: boolean; options: Opt[] };
export type CatQ = { kind: "categorize"; question_text: string; explanation: string; is_required: boolean; categories: string[]; cards: { card_text: string; category_index: number }[] };
export type ScenQ = { kind: "scenario"; scenario_text: string; scenario_prompt: string; questions: ChoiceQ[] };
export type EditorItem = ChoiceQ | CatQ | ScenQ;
export type ItemKind = "single" | "multiple" | "categorize";

/** Doğrulanmış sınav girdisi → editör durumu (isteğe bağlı alanlar boş metin olur). */
export function toEditor(q: z.infer<typeof quizSchema>["questions"][number]): EditorItem {
  if (q.kind === "scenario") return { kind: "scenario", scenario_text: q.scenario_text, scenario_prompt: q.scenario_prompt ?? "", questions: q.questions.map((c) => ({ ...c, explanation: c.explanation ?? "" })) };
  return { ...q, explanation: q.explanation ?? "" };
}

export const blankChoice = (kind: ChoiceQ["kind"] = "single"): ChoiceQ => ({
  kind,
  question_text: "",
  explanation: "",
  is_required: false,
  options: [{ option_text: "", is_correct: true }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }],
});

export const blankCategorize = (): CatQ => ({
  kind: "categorize",
  question_text: "",
  explanation: "",
  is_required: false,
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
  const base = { question_text: q.question_text, explanation: q.explanation, is_required: q.is_required };
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

/** Havuz doğrulaması için puanlanan sorular: senaryo alt soruları kendi tipiyle, senaryonun kendisi hariç. */
export function poolFromEditor(items: EditorItem[]): { kind: PoolKind; required: boolean }[] {
  return items.flatMap((q) => (q.kind === "scenario" ? q.questions : [q])).map((q) => ({ kind: q.kind, required: q.is_required }));
}

const positiveInt = (v: string) => {
  const n = Number(v.trim());
  return v.trim() !== "" && Number.isInteger(n) && n >= 1 ? n : null;
};

/** Havuz formu (metin alanları) → ayar: boş, 0, yazı, ondalık ve negatif değerler "yok" sayılır (sayı → null, kota → anahtar yok). */
export function configFromForm(drawCount: string, byType: Record<PoolKind, string>): PoolConfig {
  const quotas: PoolConfig["byType"] = {};
  for (const kind of POOL_KINDS) {
    const n = positiveInt(byType[kind]);
    if (n !== null) quotas[kind] = n;
  }
  return { drawCount: positiveInt(drawCount), byType: quotas };
}

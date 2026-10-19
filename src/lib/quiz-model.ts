// Sınav soru modeli: öğrenciye giden soru biçimi, cevap biçimi ve sıralama. Saf modül (istemci + sunucu).

export type QuestionKind = "single" | "multiple" | "categorize";

/** Senaryolu sorunun alt sorularında gösterilen senaryo; kendisi puanlanmaz. */
export type ScenarioRef = { id: number; text: string; prompt: string | null };

type Choice = { id: number; text: string };

/** Öğrenciye gönderilen puanlanan soru. Doğru şık / kartın doğru kategorisi BİLEREK yoktur. */
export type PublicQuestion = { id: number; text: string; scenario: ScenarioRef | null } & (
  | { kind: "single"; options: Choice[] }
  | { kind: "multiple"; options: Choice[]; correctCount: number }
  | { kind: "categorize"; cards: Choice[]; categories: { id: number; name: string }[] }
);

/** single: şık id · multiple: şık id'leri · categorize: { kartId: kategoriId } */
export type Answer = number | number[] | Record<string, number>;

/** Bir sorunun puanlama sonucu; cardResults yalnızca categorize'da (kart başına doğru/yanlış). */
export type GradeResult = {
  points: number; // 0–1
  isCorrect: boolean; // points === 1
  answer: Answer | null; // normalize edilmiş cevap
  cardResults?: Record<string, boolean>;
  optionResults?: Record<string, boolean>; // multiple: yalnızca seçilen şıklar
  explanation?: string; // yalnızca points < 1 iken
};

/** Sınavın üst düzey öğesi: tek soru ya da alt sorularıyla senaryo. */
export type QuizItem = { kind: "question"; question: PublicQuestion } | { kind: "scenario"; scenario: ScenarioRef; questions: PublicQuestion[] };

export function isAnswered(q: PublicQuestion, a: Answer | undefined): boolean {
  if (a === undefined) return false;
  switch (q.kind) {
    case "single":
      return typeof a === "number";
    case "multiple":
      return Array.isArray(a) && a.length === q.correctCount;
    case "categorize":
      return typeof a === "object" && !Array.isArray(a) && q.cards.every((c) => String(c.id) in a);
  }
}

/** Bir sınav oturumunda öğrenciye gösterilen sıra: sorular ve her sorunun şık/kart id'leri. */
export type SavedOrder = { id: number; choices: number[] }[];

const choicesOf = (q: PublicQuestion) => (q.kind === "categorize" ? q.cards : q.options);

export function snapshotOrder(qs: PublicQuestion[]): SavedOrder {
  return qs.map((q) => ({ id: q.id, choices: choicesOf(q).map((c) => c.id) }));
}

/**
 * Kaydedilmiş sırayı geri uygular (öğrenci sınava döndüğünde sorular yeniden karışmasın).
 * Soru ya da şık kümesi değiştiyse (yönetici sınavı düzenlediyse) null döner.
 */
export function applySavedOrder(qs: PublicQuestion[], saved: SavedOrder): PublicQuestion[] | null {
  if (saved.length !== qs.length) return null;
  const byId = new Map(qs.map((q) => [q.id, q]));
  const out: PublicQuestion[] = [];
  for (const s of saved) {
    const q = byId.get(s.id);
    if (!q) return null;
    const pool = new Map(choicesOf(q).map((c) => [c.id, c]));
    if (s.choices.length !== pool.size || !s.choices.every((id) => pool.has(id))) return null;
    const ordered = s.choices.map((id) => pool.get(id)!);
    out.push(q.kind === "categorize" ? { ...q, cards: ordered } : { ...q, options: ordered });
    byId.delete(s.id);
  }
  return out;
}

/** Üst düzey öğeler karıştırılır; senaryonun alt soruları kendi sırasında, bitişik kalır. */
export function orderForStudent(items: QuizItem[], shuffle: <T>(a: T[]) => T[]): PublicQuestion[] {
  return shuffle(items).flatMap((it) => (it.kind === "question" ? [it.question] : it.questions));
}

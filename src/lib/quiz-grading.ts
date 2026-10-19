// Sınav puanlaması. Saf modül: doğru cevap bilgisi yalnızca burada ve sunucuda kullanılır, sonuca girmez.
import type { Answer, GradeResult } from "./quiz-model.ts";

/** Sunucunun puanlama için bildiği soru (doğru cevaplar dahil). */
export type GradingQuestion = { id: number; explanation: string | null } & (
  | { kind: "single" | "multiple"; optionIds: number[]; correctOptionIds: number[] }
  | { kind: "categorize"; categoryIds: number[]; cardCategory: Record<string, number> } // { kartId: doğru kategoriId }
);

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Bir soruyu puanlar. Kısmi puan yalnızca categorize'da (kart başına); single/multiple tam doğru ya da 0.
 * Kurcalanmış/eksik cevaplar hata vermez: geçersiz kısımlar atılır ve yanlış sayılır.
 */
export function gradeQuestion(q: GradingQuestion, raw: unknown): GradeResult {
  let points = 0;
  let answer: Answer | null = null;
  let cardResults: Record<string, boolean> | undefined;
  let optionResults: Record<string, boolean> | undefined;

  if (q.kind === "categorize") {
    const placed: Record<string, number> = {};
    if (isPlainObject(raw)) {
      for (const [card, cat] of Object.entries(raw)) {
        if (card in q.cardCategory && typeof cat === "number" && q.categoryIds.includes(cat)) placed[card] = cat;
      }
    }
    cardResults = {};
    for (const [card, correctCat] of Object.entries(q.cardCategory)) cardResults[card] = placed[card] === correctCat;
    const total = Object.keys(q.cardCategory).length;
    points = total ? Object.values(cardResults).filter(Boolean).length / total : 0;
    if (Object.keys(placed).length) answer = placed;
  } else if (q.kind === "single") {
    if (typeof raw === "number" && q.optionIds.includes(raw)) {
      answer = raw;
      points = q.correctOptionIds.includes(raw) ? 1 : 0;
    }
  } else if (Array.isArray(raw)) {
    const picked = [...new Set(raw.filter((v): v is number => typeof v === "number" && q.optionIds.includes(v)))];
    if (picked.length) answer = picked;
    // Geçersiz bir id gönderildiyse cevap kümesi doğru kümeyle aynı sayılmaz.
    const tampered = picked.length !== new Set(raw).size;
    const correct = new Set(q.correctOptionIds);
    points = !tampered && picked.length === correct.size && picked.every((id) => correct.has(id)) ? 1 : 0;
    // Yalnızca öğrencinin seçtiği şıklar: seçilmeyen doğru şıklar sızmaz. Doğru sayısından fazla seçim
    // (arayüz izin vermez; elle gönderim) şık başına sonuç almaz, yoksa tüm şıkları gönderen cevap anahtarını görür.
    if (!tampered && picked.length <= correct.size) optionResults = Object.fromEntries(picked.map((id) => [String(id), correct.has(id)]));
  }

  return {
    points,
    isCorrect: points === 1,
    answer,
    ...(cardResults ? { cardResults } : {}),
    ...(optionResults ? { optionResults } : {}),
    ...(points < 1 && q.explanation ? { explanation: q.explanation } : {}),
  };
}

/** Toplam skor: her soru 1 birim, kısmi puanlar toplanır; correctCount yalnızca tam doğru sorular. */
export function scoreAttempt(results: GradeResult[]): { score: number; points: number; correctCount: number } {
  const points = results.reduce((s, r) => s + r.points, 0);
  return {
    score: results.length ? Math.round((points / results.length) * 100) : 0,
    points,
    correctCount: results.filter((r) => r.isCorrect).length,
  };
}

/** quiz_attempts.answers: MySQL nesne, MariaDB metin döndürür; eski kayıtlar { soruId: şıkId | null }. */
export function parseStoredAnswers(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return isPlainObject(raw) ? raw : {};
}

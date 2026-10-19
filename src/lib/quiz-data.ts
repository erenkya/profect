import "server-only";
import type { RowDataPacket } from "mysql2";
import type { z } from "zod";
import pool from "@/lib/db";
import { shuffle } from "@/lib/lms";
import type { quizSchema } from "@/lib/admin-schemas";
import type { GradingQuestion } from "@/lib/quiz-grading";
import { orderForStudent, type PublicQuestion, type QuizItem, type ScenarioRef } from "@/lib/quiz-model";

type QuizInput = z.infer<typeof quizSchema>;

type QRow = { id: number; type: "single" | "multiple" | "categorize" | "scenario"; parent_id: number | null; question_text: string; explanation: string | null; scenario_prompt: string | null };
type ORow = { id: number; question_id: number; option_text: string; is_correct: number; category_id: number | null };
type CRow = { id: number; question_id: number; name: string };

async function fetchRows(quizId: number) {
  const [questions] = await pool.query<RowDataPacket[]>(
    "SELECT id, type, parent_id, question_text, explanation, scenario_prompt FROM questions WHERE quiz_id = ? ORDER BY position, id",
    [quizId],
  );
  const ids = questions.map((q) => q.id);
  if (ids.length === 0) return { questions: [] as QRow[], options: [] as ORow[], categories: [] as CRow[] };
  const [[options], [categories]] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT id, question_id, option_text, is_correct, category_id FROM options WHERE question_id IN (?) ORDER BY id", [ids]),
    pool.query<RowDataPacket[]>("SELECT id, question_id, name FROM question_categories WHERE question_id IN (?) ORDER BY position, id", [ids]),
  ]);
  return { questions: questions as QRow[], options: options as ORow[], categories: categories as CRow[] };
}

/**
 * Sınavın soruları editör sırasıyla. `items` öğrenciye gidebilir (doğru bilgisi yok);
 * `grading` yalnızca sunucuda puanlama için (puanlanan soru id'si → doğru cevaplar).
 */
export async function loadQuiz(quizId: number): Promise<{ items: QuizItem[]; grading: Map<number, GradingQuestion> }> {
  const { questions, options, categories } = await fetchRows(quizId);
  const grading = new Map<number, GradingQuestion>();

  const build = (q: QRow, scenario: ScenarioRef | null): PublicQuestion => {
    const opts = options.filter((o) => o.question_id === q.id);
    const explanation = q.explanation ?? null;
    if (q.type === "categorize") {
      const cats = categories.filter((c) => c.question_id === q.id);
      grading.set(q.id, { id: q.id, kind: "categorize", explanation, categoryIds: cats.map((c) => c.id), cardCategory: Object.fromEntries(opts.map((o) => [String(o.id), o.category_id ?? 0])) });
      return { id: q.id, kind: "categorize", text: q.question_text, scenario, cards: opts.map((o) => ({ id: o.id, text: o.option_text })), categories: cats.map((c) => ({ id: c.id, name: c.name })) };
    }
    const kind = q.type === "multiple" ? "multiple" : "single";
    const correctOptionIds = opts.filter((o) => o.is_correct === 1).map((o) => o.id);
    grading.set(q.id, { id: q.id, kind, explanation, optionIds: opts.map((o) => o.id), correctOptionIds });
    const choices = opts.map((o) => ({ id: o.id, text: o.option_text }));
    return kind === "multiple"
      ? { id: q.id, kind, text: q.question_text, scenario, options: choices, correctCount: correctOptionIds.length }
      : { id: q.id, kind, text: q.question_text, scenario, options: choices };
  };

  const items: QuizItem[] = questions
    .filter((q) => q.parent_id === null)
    .map((q) => {
      if (q.type !== "scenario") return { kind: "question", question: build(q, null) };
      const scenario: ScenarioRef = { id: q.id, text: q.question_text, prompt: q.scenario_prompt ?? null };
      return { kind: "scenario", scenario, questions: questions.filter((c) => c.parent_id === q.id).map((c) => build(c, scenario)) };
    });
  return { items, grading };
}

/** Öğrenciye gidecek sıra: üst düzey öğeler ve şıklar/kartlar karıştırılır, kategoriler sabit. */
export function studentQuestions(items: QuizItem[]): PublicQuestion[] {
  return orderForStudent(items, shuffle).map((q) =>
    q.kind === "categorize" ? { ...q, cards: shuffle(q.cards) } : { ...q, options: shuffle(q.options) },
  );
}

/** Yönetici editörünün girdi biçimi (quizSchema.questions ile aynı). */
export async function loadQuizForEditor(quizId: number): Promise<QuizInput["questions"]> {
  const { questions, options, categories } = await fetchRows(quizId);
  const choice = (q: QRow) => ({
    kind: q.type === "multiple" ? ("multiple" as const) : ("single" as const),
    question_text: q.question_text,
    explanation: q.explanation ?? "",
    options: options.filter((o) => o.question_id === q.id).map((o) => ({ option_text: o.option_text, is_correct: o.is_correct === 1 })),
  });
  return questions
    .filter((q) => q.parent_id === null)
    .map((q) => {
      if (q.type === "scenario") {
        return { kind: "scenario" as const, scenario_text: q.question_text, scenario_prompt: q.scenario_prompt ?? "", questions: questions.filter((c) => c.parent_id === q.id).map(choice) };
      }
      if (q.type === "categorize") {
        const cats = categories.filter((c) => c.question_id === q.id);
        return {
          kind: "categorize" as const,
          question_text: q.question_text,
          explanation: q.explanation ?? "",
          categories: cats.map((c) => c.name),
          cards: options.filter((o) => o.question_id === q.id).map((o) => ({ card_text: o.option_text, category_index: cats.findIndex((c) => c.id === o.category_id) })),
        };
      }
      return choice(q);
    });
}

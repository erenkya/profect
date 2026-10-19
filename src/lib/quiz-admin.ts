import "server-only";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2";
import type { z } from "zod";
import type { quizSchema } from "@/lib/admin-schemas";

type QuizInput = z.infer<typeof quizSchema>;
type Item = QuizInput["questions"][number];
type ChoiceInput = Extract<Item, { kind: "single" | "multiple" }>;

async function insertQuestion(conn: PoolConnection, cols: Record<string, string | number | null>) {
  const keys = Object.keys(cols);
  const [res] = await conn.execute<ResultSetHeader>(
    `INSERT INTO questions (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
    Object.values(cols),
  );
  return res.insertId;
}

async function writeChoice(conn: PoolConnection, quizId: number, q: ChoiceInput, position: number, parentId: number | null) {
  const id = await insertQuestion(conn, { quiz_id: quizId, type: q.kind, parent_id: parentId, question_text: q.question_text, explanation: q.explanation || null, position });
  for (const o of q.options) {
    await conn.execute("INSERT INTO options (question_id, option_text, is_correct) VALUES (?, ?, ?)", [id, o.option_text, o.is_correct ? 1 : 0]);
  }
}

/** Sorular+şıkları tek seferde yazar (bağlantı transaction içinde olmalı). Sıra = dizideki sıra. */
export async function writeQuestions(conn: PoolConnection, quizId: number, questions: QuizInput["questions"]) {
  for (const [position, q] of questions.entries()) {
    if (q.kind === "scenario") {
      const id = await insertQuestion(conn, { quiz_id: quizId, type: "scenario", question_text: q.scenario_text, scenario_prompt: q.scenario_prompt || null, position });
      for (const [i, child] of q.questions.entries()) await writeChoice(conn, quizId, child, i, id);
    } else if (q.kind === "categorize") {
      const id = await insertQuestion(conn, { quiz_id: quizId, type: "categorize", question_text: q.question_text, explanation: q.explanation || null, position });
      const categoryIds: number[] = [];
      for (const [i, name] of q.categories.entries()) {
        const [res] = await conn.execute<ResultSetHeader>("INSERT INTO question_categories (question_id, name, position) VALUES (?, ?, ?)", [id, name, i]);
        categoryIds.push(res.insertId);
      }
      for (const c of q.cards) {
        await conn.execute("INSERT INTO options (question_id, option_text, is_correct, category_id) VALUES (?, ?, 0, ?)", [id, c.card_text, categoryIds[c.category_index]]);
      }
    } else {
      await writeChoice(conn, quizId, q, position, null);
    }
  }
}

/** Sınavın tüm sorularını siler (alt sorular önce; şıklar ve kategoriler CASCADE). */
export async function deleteQuestions(conn: PoolConnection, quizId: number) {
  await conn.execute("DELETE FROM questions WHERE quiz_id = ? AND parent_id IS NOT NULL", [quizId]);
  await conn.execute("DELETE FROM questions WHERE quiz_id = ?", [quizId]);
}

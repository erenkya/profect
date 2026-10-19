import "server-only";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2";
import type { z } from "zod";
import type { quizSchema } from "@/lib/admin-schemas";

type QuizInput = z.infer<typeof quizSchema>;

/** Sorular+şıkları tek seferde yazar (bağlantı transaction içinde olmalı). */
export async function writeQuestions(conn: PoolConnection, quizId: number, questions: QuizInput["questions"]) {
  for (const q of questions) {
    const [qRes] = await conn.execute<ResultSetHeader>("INSERT INTO questions (quiz_id, question_text, explanation) VALUES (?, ?, ?)", [
      quizId,
      q.question_text,
      q.explanation || null,
    ]);
    for (const o of q.options) {
      await conn.execute("INSERT INTO options (question_id, option_text, is_correct) VALUES (?, ?, ?)", [qRes.insertId, o.option_text, o.is_correct ? 1 : 0]);
    }
  }
}

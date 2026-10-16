import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { canAccessCourse } from "@/lib/lms";

const schema = z.object({ answers: z.record(z.string(), z.coerce.number().int()) }); // { soruId: seçenekId }

export async function POST(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const quizId = parseId((await params).quizId);
  if (!quizId) return fail("Geçersiz sınav.", 400);
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;

  try {
    const [quizRows] = await pool.query<RowDataPacket[]>(
      "SELECT passing_score_percentage, course_id, module_id FROM quizzes WHERE id = ?",
      [quizId],
    );
    const quiz = quizRows[0];
    if (!quiz) return fail("Sınav bulunamadı.", 404);
    if (!(await canAccessCourse(userId, quiz.course_id))) return fail("Bu kursa erişiminiz yok.", 403);

    const [questions] = await pool.query<RowDataPacket[]>("SELECT id FROM questions WHERE quiz_id = ?", [quizId]);
    if (questions.length === 0) return fail("Bu sınavda soru yok.", 400);

    const [correct] = await pool.query<RowDataPacket[]>(
      `SELECT o.question_id, o.id AS option_id FROM options o
         JOIN questions q ON q.id = o.question_id WHERE q.quiz_id = ? AND o.is_correct = 1`,
      [quizId],
    );
    const correctMap = new Map<number, number>(correct.map((r) => [r.question_id, r.option_id]));

    let correctCount = 0;
    const results: Record<number, { isCorrect: boolean; selectedOptionId: number | null }> = {};
    for (const q of questions) {
      const selected = body.data.answers[String(q.id)] ?? null;
      const isCorrect = selected !== null && correctMap.get(q.id) === selected;
      if (isCorrect) correctCount++;
      // Doğru şık bilgisi bilerek DÖNMEZ: yanlış yapılan sorunun cevabı sızmasın.
      results[q.id] = { isCorrect, selectedOptionId: selected };
    }

    const score = Math.round((correctCount / questions.length) * 100);
    const isPassed = score >= quiz.passing_score_percentage;

    await pool.execute("INSERT INTO quiz_attempts (user_id, quiz_id, score, is_passed) VALUES (?, ?, ?, ?)", [
      userId,
      quizId,
      score,
      isPassed ? 1 : 0,
    ]);
    if (isPassed && quiz.module_id === null) {
      await pool.execute("UPDATE enrollments SET status = 'completed' WHERE user_id = ? AND course_id = ?", [userId, quiz.course_id]);
    }

    return ok({ score, isPassed, correctCount, totalQuestions: questions.length, results });
  } catch (err) {
    return serverError("[POST /api/client/quizzes/:id/submit]", err);
  }
}

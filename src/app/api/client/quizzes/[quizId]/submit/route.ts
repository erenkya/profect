import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { canAccessCourse } from "@/lib/lms";

const GRACE_SECONDS = 15; // ağ gecikmesi / otomatik gönderim toleransı

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
      "SELECT passing_score_percentage, course_id, module_id, duration_minutes FROM quizzes WHERE id = ?",
      [quizId],
    );
    const quiz = quizRows[0];
    if (!quiz) return fail("Sınav bulunamadı.", 404);
    if (!(await canAccessCourse(userId, quiz.course_id))) return fail("Bu kursa erişiminiz yok.", 403);

    if (quiz.duration_minutes) {
      const [open] = await pool.query<RowDataPacket[]>(
        `SELECT id, TIMESTAMPDIFF(SECOND, started_at, NOW()) AS elapsed FROM quiz_sessions
          WHERE user_id = ? AND quiz_id = ? AND submitted_at IS NULL ORDER BY id DESC LIMIT 1`,
        [userId, quizId],
      );
      const session = open[0];
      if (!session) return fail("Sınav oturumu bulunamadı. Sayfayı yenileyip sınavı baştan başlatın.", 409);
      // Oturum bir kez kullanılır: eşzamanlı çift gönderim ikinci kez sayılmaz.
      const [upd] = await pool.execute<ResultSetHeader>("UPDATE quiz_sessions SET submitted_at = NOW() WHERE id = ? AND submitted_at IS NULL", [session.id]);
      if (upd.affectedRows === 0) return fail("Bu sınav oturumu zaten gönderildi.", 409);
      if (Number(session.elapsed) > quiz.duration_minutes * 60 + GRACE_SECONDS) {
        return fail("Süre doldu. Bu deneme kabul edilmedi; sınavı yeniden başlatabilirsiniz.", 408);
      }
    }

    const [questions] = await pool.query<RowDataPacket[]>("SELECT id, explanation FROM questions WHERE quiz_id = ?", [quizId]);
    if (questions.length === 0) return fail("Bu sınavda soru yok.", 400);

    const [correct] = await pool.query<RowDataPacket[]>(
      `SELECT o.question_id, o.id AS option_id FROM options o
         JOIN questions q ON q.id = o.question_id WHERE q.quiz_id = ? AND o.is_correct = 1`,
      [quizId],
    );
    const correctMap = new Map<number, number>(correct.map((r) => [r.question_id, r.option_id]));

    let correctCount = 0;
    const results: Record<number, { isCorrect: boolean; selectedOptionId: number | null; explanation?: string }> = {};
    for (const q of questions) {
      const selected = body.data.answers[String(q.id)] ?? null;
      const isCorrect = selected !== null && correctMap.get(q.id) === selected;
      if (isCorrect) correctCount++;
      // Doğru şık bilgisi bilerek DÖNMEZ: yanlış yapılan sorunun cevabı sızmasın.
      // Yöneticinin yazdığı açıklama ise yalnızca yanlış cevaplanan soruda gönderilir.
      results[q.id] = { isCorrect, selectedOptionId: selected, ...(!isCorrect && q.explanation ? { explanation: q.explanation } : {}) };
    }

    const score = Math.round((correctCount / questions.length) * 100);
    const isPassed = score >= quiz.passing_score_percentage;

    const answers = Object.fromEntries(Object.entries(results).map(([qid, r]) => [qid, r.selectedOptionId]));
    await pool.execute("INSERT INTO quiz_attempts (user_id, quiz_id, score, is_passed, answers) VALUES (?, ?, ?, ?, ?)", [
      userId,
      quizId,
      score,
      isPassed ? 1 : 0,
      JSON.stringify(answers),
    ]);
    if (isPassed && quiz.module_id === null) {
      await pool.execute("UPDATE enrollments SET status = 'completed' WHERE user_id = ? AND course_id = ?", [userId, quiz.course_id]);
    }

    return ok({ score, isPassed, correctCount, totalQuestions: questions.length, results });
  } catch (err) {
    return serverError("[POST /api/client/quizzes/:id/submit]", err);
  }
}

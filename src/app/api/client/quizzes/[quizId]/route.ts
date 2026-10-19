import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseId, serverError } from "@/lib/http";
import { canAccessCourse } from "@/lib/lms";
import { flatQuestions, loadQuiz, studentQuestions } from "@/lib/quiz-data";
import { parseStoredAnswers } from "@/lib/quiz-grading";
import { applySavedOrder, snapshotOrder, type PublicQuestion, type SavedOrder } from "@/lib/quiz-model";

const parseJson = (v: unknown): unknown => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);

/**
 * Soru, şık ve kart sırası her YENİ oturumda karıştırılır (senaryo alt soruları kendi sırasında) ve oturumda saklanır;
 * doğru cevap bilgisi gönderilmez, çok cevaplıda yalnızca doğru şık sayısı.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const quizId = parseId((await params).quizId);
  if (!quizId) return fail("Geçersiz sınav.", 400);

  try {
    const [quizRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, title, course_id, module_id, passing_score_percentage, duration_minutes FROM quizzes WHERE id = ?",
      [quizId],
    );
    const quiz = quizRows[0];
    if (!quiz) return fail("Sınav bulunamadı.", 404);
    if (!(await canAccessCourse(guard.payload.userId, quiz.course_id))) return fail("Bu kursa erişiminiz yok.", 403);

    // Açık oturum varsa (süreli sınavda süresi dolmamışsa) kaldığı yerden devam: aynı soru/şık sırası, kayıtlı cevaplar,
    // süreli sınavda kalan süre (yenileyerek sıfırlanamaz). Yoksa yeni oturum açılır.
    const limitSeconds: number | null = quiz.duration_minutes ? quiz.duration_minutes * 60 : null;
    const { items } = await loadQuiz(quizId);
    const [open] = await pool.query<RowDataPacket[]>(
      `SELECT id, TIMESTAMPDIFF(SECOND, started_at, NOW()) AS elapsed, question_order, draft_answers FROM quiz_sessions
        WHERE user_id = ? AND quiz_id = ? AND submitted_at IS NULL ORDER BY id DESC LIMIT 1`,
      [guard.payload.userId, quizId],
    );
    const session = open[0] && (limitSeconds === null || Number(open[0].elapsed) < limitSeconds) ? open[0] : null;

    let questions: PublicQuestion[] | null = null;
    let draftAnswers: Record<string, unknown> = {};
    let remainingSeconds: number | null = limitSeconds;
    if (session) {
      const saved = parseJson(session.question_order);
      questions = Array.isArray(saved) ? applySavedOrder(flatQuestions(items), saved as SavedOrder) : null;
      // Sınav o arada düzenlendiyse eski sıra/cevaplar geçersiz: yeni sırayla, cevapsız devam.
      if (questions) draftAnswers = parseStoredAnswers(session.draft_answers);
      if (limitSeconds !== null) remainingSeconds = limitSeconds - Number(session.elapsed);
    }
    if (!questions) {
      questions = studentQuestions(items);
      if (session) {
        await pool.execute("UPDATE quiz_sessions SET question_order = ?, draft_answers = NULL WHERE id = ?", [JSON.stringify(snapshotOrder(questions)), session.id]);
      } else {
        await pool.execute("INSERT INTO quiz_sessions (user_id, quiz_id, question_order) VALUES (?, ?, ?)", [guard.payload.userId, quizId, JSON.stringify(snapshotOrder(questions))]);
      }
    }

    const [attempts] = await pool.query<RowDataPacket[]>(
      "SELECT MAX(is_passed) AS passed, MAX(score) AS best FROM quiz_attempts WHERE user_id = ? AND quiz_id = ?",
      [guard.payload.userId, quizId],
    );

    return ok({
      data: {
        id: quiz.id,
        title: quiz.title,
        course_id: quiz.course_id,
        module_id: quiz.module_id,
        passing_score_percentage: quiz.passing_score_percentage,
        durationMinutes: quiz.duration_minutes ?? null,
        remainingSeconds,
        isPassed: attempts[0]?.passed === 1,
        bestScore: attempts[0]?.best ?? null,
        questions,
        draftAnswers,
      },
    });
  } catch (err) {
    return serverError("[GET /api/client/quizzes/:id]", err);
  }
}

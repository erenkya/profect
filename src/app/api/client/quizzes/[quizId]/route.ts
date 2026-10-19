import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseId, serverError } from "@/lib/http";
import { canAccessCourse, shuffle } from "@/lib/lms";

/** Soru ve şık sırası HER oturumda Fisher-Yates ile karıştırılır; doğru cevap bilgisi gönderilmez. */
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

    // Süreli sınav: açık oturum varsa sayaç kaldığı yerden devam eder (yenileyerek sıfırlanamaz).
    const limitSeconds: number | null = quiz.duration_minutes ? quiz.duration_minutes * 60 : null;
    let remainingSeconds: number | null = null;
    if (limitSeconds !== null) {
      const [open] = await pool.query<RowDataPacket[]>(
        `SELECT ? - TIMESTAMPDIFF(SECOND, started_at, NOW()) AS remaining FROM quiz_sessions
          WHERE user_id = ? AND quiz_id = ? AND submitted_at IS NULL ORDER BY id DESC LIMIT 1`,
        [limitSeconds, guard.payload.userId, quizId],
      );
      if (open[0] && Number(open[0].remaining) > 0) {
        remainingSeconds = Number(open[0].remaining);
      } else {
        await pool.execute("INSERT INTO quiz_sessions (user_id, quiz_id) VALUES (?, ?)", [guard.payload.userId, quizId]);
        remainingSeconds = limitSeconds;
      }
    }

    const [attempts] = await pool.query<RowDataPacket[]>(
      "SELECT MAX(is_passed) AS passed, MAX(score) AS best FROM quiz_attempts WHERE user_id = ? AND quiz_id = ?",
      [guard.payload.userId, quizId],
    );

    const [questions] = await pool.query<RowDataPacket[]>("SELECT id, question_text FROM questions WHERE quiz_id = ?", [quizId]);
    const ids = questions.map((q) => q.id);
    const [options] = ids.length
      ? await pool.query<RowDataPacket[]>("SELECT id, question_id, option_text FROM options WHERE question_id IN (?)", [ids])
      : [[] as RowDataPacket[]];

    const result = shuffle(
      questions.map((q) => ({
        id: q.id,
        text: q.question_text,
        options: shuffle(options.filter((o) => o.question_id === q.id).map((o) => ({ id: o.id, text: o.option_text }))),
      })),
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
        questions: result,
      },
    });
  } catch (err) {
    return serverError("[GET /api/client/quizzes/:id]", err);
  }
}

import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { canAccessCourse } from "@/lib/lms";

const MAX_DRAFT_BYTES = 64 * 1024;

// { soruId: cevap } — biçim gönderimde gradeQuestion ile doğrulanır; burada yalnızca saklanır.
const schema = z.object({ answers: z.record(z.string(), z.unknown()) });

/** Sınav ilerlemesini kaydeder: öğrenci sonraki soruya geçtikçe açık oturumun taslak cevapları güncellenir. */
export async function PUT(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const quizId = parseId((await params).quizId);
  if (!quizId) return fail("Geçersiz sınav.", 400);
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;

  try {
    const [quizRows] = await pool.query<RowDataPacket[]>("SELECT course_id, duration_minutes FROM quizzes WHERE id = ?", [quizId]);
    const quiz = quizRows[0];
    if (!quiz) return fail("Sınav bulunamadı.", 404);
    if (!(await canAccessCourse(userId, quiz.course_id))) return fail("Bu kursa erişiminiz yok.", 403);

    const [open] = await pool.query<RowDataPacket[]>(
      `SELECT id, TIMESTAMPDIFF(SECOND, started_at, NOW()) AS elapsed, question_order FROM quiz_sessions
        WHERE user_id = ? AND quiz_id = ? AND submitted_at IS NULL ORDER BY id DESC LIMIT 1`,
      [userId, quizId],
    );
    const session = open[0];
    if (!session || (quiz.duration_minutes && Number(session.elapsed) >= quiz.duration_minutes * 60)) {
      return fail("Açık sınav oturumu yok.", 409);
    }

    // Yalnızca bu oturumdaki soruların cevapları saklanır.
    const order = typeof session.question_order === "string" ? JSON.parse(session.question_order) : session.question_order;
    const ids = new Set(Array.isArray(order) ? order.map((o: { id: number }) => String(o.id)) : []);
    const draft = Object.fromEntries(Object.entries(body.data.answers).filter(([qid]) => ids.has(qid)));
    const json = JSON.stringify(draft);
    if (json.length > MAX_DRAFT_BYTES) return fail("Cevaplar çok büyük.", 413);

    await pool.execute("UPDATE quiz_sessions SET draft_answers = ? WHERE id = ?", [json, session.id]);
    return ok({});
  } catch (err) {
    return serverError("[PUT /api/client/quizzes/:id/progress]", err);
  }
}

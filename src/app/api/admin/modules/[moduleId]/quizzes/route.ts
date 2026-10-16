import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { quizSchema } from "@/lib/admin-schemas";
import { writeQuestions } from "@/lib/quiz-admin";

/** Modül sınavı oluşturur (modül başına bir tane). */
export async function POST(request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const moduleId = parseId((await params).moduleId);
  if (!moduleId) return fail("Geçersiz modül.", 400);
  const body = await parseBody(request, quizSchema.partial({ questions: true }));
  if (body.error) return body.error;
  const d = body.data;
  const conn = await pool.getConnection();
  try {
    const [m] = await conn.query<RowDataPacket[]>("SELECT course_id FROM modules WHERE id = ?", [moduleId]);
    if (m.length === 0) return fail("Modül bulunamadı.", 404);
    const [dup] = await conn.query<RowDataPacket[]>("SELECT 1 FROM quizzes WHERE module_id = ?", [moduleId]);
    if (dup.length > 0) return fail("Bu modülün zaten bir sınavı var.", 409);

    await conn.beginTransaction();
    const [res] = await conn.execute<ResultSetHeader>(
      "INSERT INTO quizzes (course_id, module_id, title, passing_score_percentage) VALUES (?, ?, ?, ?)",
      [m[0].course_id, moduleId, d.title, d.passing_score_percentage],
    );
    await writeQuestions(conn, res.insertId, d.questions ?? []);
    await conn.commit();
    return ok({ quizId: res.insertId }, 201);
  } catch (err) {
    await conn.rollback();
    return serverError("[POST /api/admin/modules/:id/quizzes]", err);
  } finally {
    conn.release();
  }
}

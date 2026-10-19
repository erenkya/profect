import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { quizSchema } from "@/lib/admin-schemas";
import { deleteQuestions, writeQuestions } from "@/lib/quiz-admin";
import { loadQuizForEditor } from "@/lib/quiz-data";

type Ctx = { params: Promise<{ quizId: string }> };

/** Yönetici görünümü: doğru şıklar dahil. */
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).quizId);
  if (!id) return fail("Geçersiz sınav.", 400);
  try {
    const [quiz] = await pool.query<RowDataPacket[]>("SELECT * FROM quizzes WHERE id = ?", [id]);
    if (!quiz[0]) return fail("Sınav bulunamadı.", 404);
    return ok({ quiz: { ...quiz[0], questions: await loadQuizForEditor(id) } });
  } catch (err) {
    return serverError("[GET /api/admin/quizzes/:id]", err);
  }
}

/** Başlık, geçme notu, süre ve TÜM soruları değiştirir (transaction). */
export async function PUT(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).quizId);
  if (!id) return fail("Geçersiz sınav.", 400);
  const body = await parseBody(request, quizSchema);
  if (body.error) return body.error;
  const d = body.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [upd] = await conn.execute<ResultSetHeader>("UPDATE quizzes SET title = ?, passing_score_percentage = ?, duration_minutes = ? WHERE id = ?", [d.title, d.passing_score_percentage, d.duration_minutes, id]);
    if (upd.affectedRows === 0) {
      await conn.rollback();
      return fail("Sınav bulunamadı.", 404);
    }
    await deleteQuestions(conn, id);
    await writeQuestions(conn, id, d.questions);
    await conn.commit();
    return ok({ message: "Sınav güncellendi." });
  } catch (err) {
    await conn.rollback();
    return serverError("[PUT /api/admin/quizzes/:id]", err);
  } finally {
    conn.release();
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).quizId);
  if (!id) return fail("Geçersiz sınav.", 400);
  try {
    const [res] = await pool.execute<ResultSetHeader>("DELETE FROM quizzes WHERE id = ?", [id]);
    return res.affectedRows ? ok({}) : fail("Sınav bulunamadı.", 404);
  } catch (err) {
    return serverError("[DELETE /api/admin/quizzes/:id]", err);
  }
}

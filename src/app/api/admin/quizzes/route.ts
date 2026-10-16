import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { quizSchema } from "@/lib/admin-schemas";
import { writeQuestions } from "@/lib/quiz-admin";

/** Kurs FİNAL sınavı oluşturur (kurs başına bir tane). */
const schema = quizSchema.partial({ questions: true }).extend({ course_id: z.coerce.number().int().positive() });

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const d = body.data;
  const conn = await pool.getConnection();
  try {
    const [c] = await conn.query<RowDataPacket[]>("SELECT 1 FROM courses WHERE id = ?", [d.course_id]);
    if (c.length === 0) return fail("Kurs bulunamadı.", 404);
    const [dup] = await conn.query<RowDataPacket[]>("SELECT 1 FROM quizzes WHERE course_id = ? AND module_id IS NULL", [d.course_id]);
    if (dup.length > 0) return fail("Bu kursun zaten bir final sınavı var.", 409);

    await conn.beginTransaction();
    const [res] = await conn.execute<ResultSetHeader>(
      "INSERT INTO quizzes (course_id, module_id, title, passing_score_percentage) VALUES (?, NULL, ?, ?)",
      [d.course_id, d.title, d.passing_score_percentage],
    );
    await writeQuestions(conn, res.insertId, d.questions ?? []);
    await conn.commit();
    return ok({ quizId: res.insertId }, 201);
  } catch (err) {
    await conn.rollback();
    return serverError("[POST /api/admin/quizzes]", err);
  } finally {
    conn.release();
  }
}

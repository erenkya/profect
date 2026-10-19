import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { lessonSchema } from "@/lib/admin-schemas";
import { validateLessonVideo } from "@/lib/lesson-video";

export async function POST(request: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const moduleId = parseId((await params).moduleId);
  if (!moduleId) return fail("Geçersiz modül.", 400);
  const body = await parseBody(request, lessonSchema);
  if (body.error) return body.error;
  const d = body.data;
  try {
    const [m] = await pool.query<RowDataPacket[]>("SELECT 1 FROM modules WHERE id = ?", [moduleId]);
    if (m.length === 0) return fail("Modül bulunamadı.", 404);
    if (d.lesson_type === "video") {
      const problem = await validateLessonVideo(d.content, moduleId);
      if (problem) return fail(problem, 400);
    }
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO lessons (module_id, title, lesson_type, content, duration_minutes, sort_order)
       SELECT ?, ?, ?, ?, ?, COALESCE(MAX(sort_order) + 1, 0) FROM lessons WHERE module_id = ?`,
      [moduleId, d.title, d.lesson_type, d.content, d.duration_minutes, moduleId],
    );
    return ok({ lessonId: res.insertId }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/modules/:id/lessons]", err);
  }
}

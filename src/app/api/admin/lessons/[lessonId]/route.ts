import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { lessonSchema } from "@/lib/admin-schemas";
import { extractVideoId } from "@/lib/lms";

type Ctx = { params: Promise<{ lessonId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).lessonId);
  if (!id) return fail("Geçersiz ders.", 400);
  const body = await parseBody(request, lessonSchema);
  if (body.error) return body.error;
  const d = body.data;
  try {
    const content = d.lesson_type === "video" ? extractVideoId(d.content) : d.content;
    const [res] = await pool.execute<ResultSetHeader>(
      "UPDATE lessons SET title = ?, lesson_type = ?, content = ?, duration_minutes = ? WHERE id = ?",
      [d.title, d.lesson_type, content, d.duration_minutes ?? null, id],
    );
    return res.affectedRows ? ok({}) : fail("Ders bulunamadı.", 404);
  } catch (err) {
    return serverError("[PATCH /api/admin/lessons/:id]", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).lessonId);
  if (!id) return fail("Geçersiz ders.", 400);
  try {
    const [res] = await pool.execute<ResultSetHeader>("DELETE FROM lessons WHERE id = ?", [id]);
    return res.affectedRows ? ok({}) : fail("Ders bulunamadı.", 404);
  } catch (err) {
    return serverError("[DELETE /api/admin/lessons/:id]", err);
  }
}

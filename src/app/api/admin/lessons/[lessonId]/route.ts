import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { lessonSchema } from "@/lib/admin-schemas";
import { listVideoKeys, validateLessonVideo } from "@/lib/lesson-video";
import { deleteVideo, deleteVideos } from "@/lib/r2";
import { isVideoKey } from "@/lib/video-key";

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
    const [cur] = await pool.query<RowDataPacket[]>("SELECT module_id, lesson_type, content FROM lessons WHERE id = ?", [id]);
    if (cur.length === 0) return fail("Ders bulunamadı.", 404);
    const old = cur[0] as { module_id: number; lesson_type: "video" | "text"; content: string };
    const oldKey = old.lesson_type === "video" && isVideoKey(old.content) ? old.content : null;
    const keyChanged = d.lesson_type !== "video" || d.content !== old.content;
    if (d.lesson_type === "video" && keyChanged) {
      const problem = await validateLessonVideo(d.content, old.module_id);
      if (problem) return fail(problem, 400);
    }
    const [res] = await pool.execute<ResultSetHeader>(
      "UPDATE lessons SET title = ?, lesson_type = ?, content = ?, duration_minutes = ? WHERE id = ?",
      [d.title, d.lesson_type, d.content, d.duration_minutes ?? null, id],
    );
    if (!res.affectedRows) return fail("Ders bulunamadı.", 404);
    // Video değiştiyse (ya da derse metne çevrildiyse) eski nesne R2'de sahipsiz kalmasın.
    if (oldKey && keyChanged) await deleteVideo(oldKey);
    return ok({});
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
    const keys = await listVideoKeys("lesson", id);
    const [res] = await pool.execute<ResultSetHeader>("DELETE FROM lessons WHERE id = ?", [id]);
    if (!res.affectedRows) return fail("Ders bulunamadı.", 404);
    await deleteVideos(keys);
    return ok({});
  } catch (err) {
    return serverError("[DELETE /api/admin/lessons/:id]", err);
  }
}

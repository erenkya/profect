import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAnswerLesson } from "@/lib/comments";
import { fail, ok, parseId, serverError } from "@/lib/http";

/** Yorumu kaldırır (hukuka aykırı içerik bildirimi üzerine). Yönetici hepsini, eğitmen yalnızca kendi dersindekileri; soru silinirse cevapları da gider. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Geçersiz yorum.", 400);

  try {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT lesson_id FROM lesson_comments WHERE id = ?", [id]);
    if (rows.length === 0) return fail("Yorum bulunamadı.", 404);
    if (!(await canAnswerLesson({ id: guard.payload.userId, role: guard.payload.role }, rows[0].lesson_id))) {
      return fail("Bu yorumu kaldırma yetkiniz yok.", 403);
    }
    await pool.execute("DELETE FROM lesson_comments WHERE id = ?", [id]);
    return ok();
  } catch (err) {
    return serverError("[DELETE /api/client/comments/:id]", err);
  }
}

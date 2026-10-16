import { z } from "zod";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, parseBody, serverError } from "@/lib/http";
import { reorderSchema } from "@/lib/admin-schemas";

/** Gövde: { course_id, ids: [modül id'leri yeni sırayla] } */
export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, reorderSchema.extend({ course_id: z.coerce.number().int().positive() }));
  if (body.error) return body.error;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [i, id] of body.data.ids.entries()) {
      // course_id şartı: başka kursun modülünün sırası değiştirilemez.
      await conn.execute("UPDATE modules SET sort_order = ? WHERE id = ? AND course_id = ?", [i, id, body.data.course_id]);
    }
    await conn.commit();
    return ok({});
  } catch (err) {
    await conn.rollback();
    return serverError("[PATCH /api/admin/modules/reorder]", err);
  } finally {
    conn.release();
  }
}

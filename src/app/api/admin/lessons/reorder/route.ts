import { z } from "zod";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, parseBody, serverError } from "@/lib/http";
import { reorderSchema } from "@/lib/admin-schemas";

/** Gövde: { module_id, ids: [ders id'leri yeni sırayla] } */
export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, reorderSchema.extend({ module_id: z.coerce.number().int().positive() }));
  if (body.error) return body.error;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [i, id] of body.data.ids.entries()) {
      await conn.execute("UPDATE lessons SET sort_order = ? WHERE id = ? AND module_id = ?", [i, id, body.data.module_id]);
    }
    await conn.commit();
    return ok({});
  } catch (err) {
    await conn.rollback();
    return serverError("[PATCH /api/admin/lessons/reorder]", err);
  } finally {
    conn.release();
  }
}

import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";

type Ctx = { params: Promise<{ moduleId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).moduleId);
  if (!id) return fail("Geçersiz modül.", 400);
  const body = await parseBody(request, z.object({ title: z.string().trim().min(1).max(255) }));
  if (body.error) return body.error;
  try {
    const [res] = await pool.execute<ResultSetHeader>("UPDATE modules SET title = ? WHERE id = ?", [body.data.title, id]);
    return res.affectedRows ? ok({}) : fail("Modül bulunamadı.", 404);
  } catch (err) {
    return serverError("[PATCH /api/admin/modules/:id]", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).moduleId);
  if (!id) return fail("Geçersiz modül.", 400);
  try {
    const [res] = await pool.execute<ResultSetHeader>("DELETE FROM modules WHERE id = ?", [id]);
    return res.affectedRows ? ok({}) : fail("Modül bulunamadı.", 404);
  } catch (err) {
    return serverError("[DELETE /api/admin/modules/:id]", err);
  }
}

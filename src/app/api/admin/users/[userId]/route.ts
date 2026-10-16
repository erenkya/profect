import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";

type Ctx = { params: Promise<{ userId: string }> };

const patchSchema = z.object({
  is_active: z.boolean().optional(),
  role: z.enum(["user", "admin"]).optional(),
  email_verified: z.boolean().optional(),
  // Plus erişimini elle ver/kaldır: ISO tarih ya da null
  plus_until: z.string().datetime().nullable().optional(),
});

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).userId);
  if (!id) return fail("Geçersiz kullanıcı.", 400);
  const body = await parseBody(request, patchSchema);
  if (body.error) return body.error;
  const d = body.data;

  // Yönetici kendini kilitleyemesin (son admin'in erişimini yitirmesini önler).
  if (id === guard.payload.userId && (d.is_active === false || d.role === "user")) {
    return fail("Kendi hesabınızı pasifleştiremez veya yetkinizi düşüremezsiniz.", 400);
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  if (d.is_active !== undefined) { sets.push("is_active = ?"); values.push(d.is_active ? 1 : 0); }
  if (d.role !== undefined) { sets.push("role = ?"); values.push(d.role); }
  if (d.email_verified !== undefined) { sets.push("email_verified = ?"); values.push(d.email_verified ? 1 : 0); }
  if (d.plus_until !== undefined) { sets.push("plus_until = ?"); values.push(d.plus_until ? d.plus_until.slice(0, 19).replace("T", " ") : null); }
  if (sets.length === 0) return fail("Güncellenecek alan yok.", 400);

  try {
    values.push(id);
    const [res] = await pool.execute<ResultSetHeader>(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, values as never[]);
    return res.affectedRows ? ok({}) : fail("Kullanıcı bulunamadı.", 404);
  } catch (err) {
    return serverError("[PATCH /api/admin/users/:id]", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).userId);
  if (!id) return fail("Geçersiz kullanıcı.", 400);
  if (id === guard.payload.userId) return fail("Kendi hesabınızı silemezsiniz.", 400);
  try {
    const [res] = await pool.execute<ResultSetHeader>("DELETE FROM users WHERE id = ?", [id]);
    return res.affectedRows ? ok({}) : fail("Kullanıcı bulunamadı.", 404);
  } catch (err) {
    return serverError("[DELETE /api/admin/users/:id]", err);
  }
}

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { couponPatchSchema } from "@/lib/coupon-schema";

type Ctx = { params: Promise<{ couponId: string }> };

/** { is_active: boolean } → kuponu aç/kapat */
export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).couponId);
  if (!id) return fail("Geçersiz kupon.", 400);
  const body = await parseBody(request, couponPatchSchema);
  if (body.error) return body.error;
  try {
    const [res] = await pool.execute<ResultSetHeader>("UPDATE coupons SET is_active = ? WHERE id = ?", [body.data.is_active ? 1 : 0, id]);
    return res.affectedRows ? ok({ message: body.data.is_active ? "Kupon aktif." : "Kupon pasife alındı." }) : fail("Kupon bulunamadı.", 404);
  } catch (err) {
    return serverError("[PATCH /api/admin/coupons/:id]", err);
  }
}

/** Hiç kullanılmamış kuponu siler; kullanılmışsa silinmez (sipariş geçmişi bozulmasın) → pasife alınmalı. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).couponId);
  if (!id) return fail("Geçersiz kupon.", 400);
  try {
    const [used] = await pool.query<RowDataPacket[]>("SELECT 1 FROM coupon_redemptions WHERE coupon_id = ? LIMIT 1", [id]);
    if (used.length) return fail("Kullanılmış kupon silinemez; pasife alın.", 409);
    const [res] = await pool.execute<ResultSetHeader>("DELETE FROM coupons WHERE id = ?", [id]);
    return res.affectedRows ? ok({ message: "Kupon silindi." }) : fail("Kupon bulunamadı.", 404);
  } catch (err) {
    return serverError("[DELETE /api/admin/coupons/:id]", err);
  }
}

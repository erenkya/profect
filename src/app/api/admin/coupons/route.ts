import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { couponCreateSchema } from "@/lib/coupon-schema";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, couponCreateSchema);
  if (body.error) return body.error;
  const c = body.data;
  try {
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO coupons (code, discount_type, discount_value, valid_from, valid_until, max_uses, max_uses_per_user)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [c.code, c.discount_type, c.discount_value, c.valid_from ? `${c.valid_from} 00:00:00` : null, c.valid_until ? `${c.valid_until} 23:59:59` : null, c.max_uses, c.max_uses_per_user],
    );
    return ok({ id: res.insertId, message: `${c.code} kuponu oluşturuldu.` }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") return fail("Bu kupon kodu zaten var.", 409);
    return serverError("[POST /api/admin/coupons]", err);
  }
}

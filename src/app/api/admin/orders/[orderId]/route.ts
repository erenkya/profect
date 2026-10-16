import { z } from "zod";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { fulfillOrder } from "@/lib/lms";

/** { action: "approve" } → ödendi say + erişimi ver · { action: "reject" } → reddet */
export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).orderId);
  if (!id) return fail("Geçersiz sipariş.", 400);
  const body = await parseBody(request, z.object({ action: z.enum(["approve", "reject"]) }));
  if (body.error) return body.error;
  try {
    if (body.data.action === "approve") {
      const r = await fulfillOrder(id);
      return r.ok ? ok({ message: "Sipariş onaylandı, erişim verildi." }) : fail(r.reason ?? "Onaylanamadı.", 404);
    }
    const [res] = await pool.execute<ResultSetHeader>("UPDATE orders SET status = 'rejected' WHERE id = ? AND status = 'pending'", [id]);
    return res.affectedRows ? ok({ message: "Sipariş reddedildi." }) : fail("Yalnızca bekleyen siparişler reddedilebilir.", 409);
  } catch (err) {
    return serverError("[PATCH /api/admin/orders/:id]", err);
  }
}

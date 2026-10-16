import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { PLUS_PRICE, canAccessCourse, fulfillOrder, getCourseBySlug, paymentMode } from "@/lib/lms";

const schema = z.discriminatedUnion("plan", [
  z.object({ plan: z.literal("single"), course_slug: z.string().min(1).max(120) }),
  z.object({ plan: z.literal("plus") }),
]);

/**
 * Sipariş oluşturur. Fiyat DAİMA sunucuda DB'den okunur (istemciden tutar alınmaz).
 * Kart bilgisi bu API'ye gönderilmez/saklanmaz. Ödeme sağlayıcısı bağlanana kadar:
 *   PAYMENT_MODE=manual (varsayılan) → sipariş "pending", admin panelinden onaylanır
 *   PAYMENT_MODE=mock                → yalnızca geliştirme/demo: anında ödendi sayılır
 */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;

  try {
    let courseId: number | null = null;
    let amount = PLUS_PRICE;

    if (body.data.plan === "single") {
      const course = await getCourseBySlug(body.data.course_slug);
      if (!course) return fail("Kurs bulunamadı.", 404);
      if (await canAccessCourse(userId, course.id)) return fail("Bu kursa zaten erişiminiz var.", 409);
      courseId = course.id;
      amount = course.price;
    }

    const [pending] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM orders WHERE user_id = ? AND plan = ? AND status = 'pending' AND (course_id <=> ?) LIMIT 1",
      [userId, body.data.plan, courseId],
    );
    let orderId = pending[0]?.id as number | undefined;
    if (!orderId) {
      const [res] = await pool.execute<ResultSetHeader>(
        "INSERT INTO orders (user_id, plan, course_id, amount, provider) VALUES (?, ?, ?, ?, ?)",
        [userId, body.data.plan, courseId, amount, paymentMode()],
      );
      orderId = res.insertId;
    }

    if (paymentMode() === "mock") {
      await fulfillOrder(orderId);
      return ok({ orderId, status: "paid" }, 201);
    }
    return ok({ orderId, status: "pending" }, 201);
  } catch (err) {
    return serverError("[POST /api/checkout]", err);
  }
}

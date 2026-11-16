import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { lockCompany } from "@/lib/company-lock";

type RefundedOrder = { id: number; user_id: number; company_id: number | null };
type Item = { item_type: string; course_id: number | null; program_id: number | null };

/**
 * İade sonuçlanırken AYNI transaction içinde çalışır: erişim, hediye, kontenjan ve kupon etkilerini geri alır.
 * Sipariş durumunu çağıran (`finalizeRefund`) yazar; burada yalnızca yan etkiler vardır.
 * Ölçüt: kullanıcının BAŞKA yoldan (hediye, admin, şirket, başka ödenmiş sipariş) sahip olduğu erişime dokunulmaz;
 * ilerleme ve sertifikalar zaten silinmez.
 */
export async function applyRefundEffects(conn: PoolConnection, order: RefundedOrder): Promise<void> {
  const [orows] = await conn.query<RowDataPacket[]>("SELECT course_id FROM orders WHERE id = ?", [order.id]);
  const [irows] = await conn.query<RowDataPacket[]>("SELECT item_type, course_id, program_id FROM order_items WHERE order_id = ?", [order.id]);
  // Eski (tek kalemli) siparişlerde kalem satırı yoktur: `orders.course_id`'den türetilir (`fulfillOrder` ile aynı).
  const items: Item[] = irows.length ? (irows as Item[]) : orows[0]?.course_id ? [{ item_type: "course", course_id: orows[0].course_id, program_id: null }] : [];

  // Hediye siparişinde kurs siparişi verene değil alıcıya gider: verenin erişimine dokunulmaz, bekleyen hediye iptal olur (link ölür).
  const [gift] = await conn.query<RowDataPacket[]>("SELECT id FROM gifts WHERE order_id = ?", [order.id]);
  if (gift.length > 0) {
    await conn.execute("UPDATE gifts SET status = 'cancelled', token_hash = NULL WHERE order_id = ? AND status IN ('pending','awaiting_payment')", [order.id]);
  } else {
    for (const it of items) {
      if (it.item_type === "course" && it.course_id) await removePurchasedCourses(conn, order, [Number(it.course_id)]);
      if (it.item_type === "program" && it.program_id) await removePurchasedProgram(conn, order, Number(it.program_id));
    }
  }

  // Şirket kontenjanı: sipariş satırı (UNIQUE order_id) silinir; şirket kilidi altında, uygunluk zaten toplamın atananın altına inmediğini doğruladı.
  if (order.company_id) {
    const hasSeats = items.some((it) => it.item_type === "seats" || it.item_type === "program_seats");
    if (hasSeats) {
      await lockCompany(conn, order.company_id);
      await conn.execute("DELETE FROM company_allocations WHERE order_id = ?", [order.id]);
      await conn.execute("DELETE FROM company_program_allocations WHERE order_id = ?", [order.id]);
    }
  }

  // Kupon kullanımı yalnızca coupon_redemptions satırlarından sayılır: satır silinince hak geri gelir.
  await conn.execute("DELETE FROM coupon_redemptions WHERE order_id = ?", [order.id]);
}

/** Kullanıcının, bu sipariş dışındaki ÖDENMİŞ (hediye olmayan) siparişlerle hâlâ karşılanan kursları. */
async function coveredElsewhere(conn: PoolConnection, order: RefundedOrder, courseIds: number[]): Promise<Set<number>> {
  const notGift = "NOT EXISTS (SELECT 1 FROM gifts g WHERE g.order_id = o.id)";
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT oi.course_id AS course_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = ? AND o.status = 'paid' AND o.id <> ? AND ${notGift} AND oi.item_type = 'course' AND oi.course_id IN (?)
     UNION
     SELECT pc.course_id FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN program_courses pc ON pc.program_id = oi.program_id
      WHERE o.user_id = ? AND o.status = 'paid' AND o.id <> ? AND ${notGift} AND oi.item_type = 'program' AND pc.course_id IN (?)
     UNION
     SELECT o.course_id FROM orders o
      WHERE o.user_id = ? AND o.status = 'paid' AND o.id <> ? AND ${notGift} AND o.course_id IN (?) AND NOT EXISTS (SELECT 1 FROM order_items x WHERE x.order_id = o.id)`,
    [order.user_id, order.id, courseIds, order.user_id, order.id, courseIds, order.user_id, order.id, courseIds],
  );
  return new Set(rows.map((r) => Number(r.course_id)));
}

/** `purchase` kaynaklı kurs kayıtlarını siler; başka ödenmiş sipariş karşılıyorsa ya da kayıt başka kaynaklıysa kalır. */
async function removePurchasedCourses(conn: PoolConnection, order: RefundedOrder, courseIds: number[]): Promise<void> {
  if (courseIds.length === 0) return;
  const covered = await coveredElsewhere(conn, order, courseIds);
  const release = courseIds.filter((id) => !covered.has(id));
  // `query` (execute değil): IN (?) için dizi ancak burada açılır.
  if (release.length > 0) await conn.query("DELETE FROM enrollments WHERE user_id = ? AND source = 'purchase' AND course_id IN (?)", [order.user_id, release]);
}

async function removePurchasedProgram(conn: PoolConnection, order: RefundedOrder, programId: number): Promise<void> {
  // Aynı programı karşılayan başka ödenmiş sipariş varsa program üyeliği kalır.
  const [other] = await conn.query<RowDataPacket[]>(
    `SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = ? AND o.status = 'paid' AND o.id <> ? AND oi.item_type = 'program' AND oi.program_id = ?
        AND NOT EXISTS (SELECT 1 FROM gifts g WHERE g.order_id = o.id) LIMIT 1`,
    [order.user_id, order.id, programId],
  );
  if (other.length === 0) await conn.execute("DELETE FROM program_enrollments WHERE user_id = ? AND program_id = ? AND source = 'purchase'", [order.user_id, programId]);
  const [pc] = await conn.query<RowDataPacket[]>("SELECT course_id FROM program_courses WHERE program_id = ?", [programId]);
  await removePurchasedCourses(conn, order, pc.map((r) => Number(r.course_id)));
}

import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import type { Billing } from "@/lib/checkout-schema";
import { normalizePhone } from "@/lib/checkout-schema";
import type { QuoteLine } from "@/lib/cart-quote";

type ItemRow = { item_type: string; course_id: number | null; program_id: number | null };
// Bekleyen sipariş eşleştirme anahtarı: DB satırı (itemKey) ve sepet satırı (lineKey) aynı biçimi üretmeli; program kalemi `program:<id>`.
const itemKey = (l: ItemRow) => (l.item_type === "plus" ? "plus" : l.item_type === "program" ? `program:${l.program_id}` : `course:${l.course_id}`);
const lineKey = (l: QuoteLine) => (l.item.type === "plus" ? "plus" : l.item.type === "program" ? `program:${l.programId}` : `course:${l.courseId}`);

type OrderInput = {
  userId: number;
  lines: QuoteLine[];
  total: number;
  billing: Billing;
  provider: string;
  ip: string;
  coupon?: { id: number; code: string } | null;
  discount?: number;
};

export const BILLING_COLUMNS = `invoice_type = ?, full_name = ?, email = ?, phone = ?, tckn = ?, company_name = ?, tax_office = ?, tax_number = ?,
  address = ?, city = ?, district = ?, zip_code = ?, consents_accepted_at = NOW(), consent_ip = ?`;

export function billingValues(b: Billing, ip: string) {
  const k = b.invoice_type === "kurumsal" ? b : null;
  return [
    b.invoice_type, b.full_name, b.email, k ? normalizePhone(k.phone) : null, null,
    k?.company_name ?? null, k?.tax_office ?? null, k?.tax_number ?? null,
    k?.address ?? null, k?.city ?? null, k?.district ?? null, k?.zip_code ?? null, ip,
  ];
}

/**
 * Sepetten sipariş oluşturur. Aynı kalemlerle bekleyen bir sipariş varsa onu günceller (çift tık / geri dön-tekrar dene
 * senaryosunda admin panelinde yinelenen sipariş birikmesin). Kart verisi buraya hiç gelmez.
 */
export async function createCartOrder(input: OrderInput): Promise<number> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const wanted = input.lines.map(lineKey).sort().join("|");

    // Program hediyesi ve şirket kontenjan siparişi de plan='cart' kullanır: normal sepet siparişi olarak yeniden kullanılmasınlar
    // (hediye ödenince aktive olurdu; kontenjan siparişinin kalemi `course:<id>` anahtarıyla sepetteki kursa benzerdi).
    const [pending] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM orders WHERE user_id = ? AND plan = 'cart' AND status = 'pending' AND company_id IS NULL AND NOT EXISTS (SELECT 1 FROM gifts g WHERE g.order_id = orders.id) ORDER BY id DESC LIMIT 20 FOR UPDATE",
      [input.userId],
    );
    let orderId: number | undefined;
    for (const p of pending) {
      const [items] = await conn.query<RowDataPacket[]>("SELECT item_type, course_id, program_id FROM order_items WHERE order_id = ?", [p.id]);
      if ((items as ItemRow[]).map(itemKey).sort().join("|") === wanted) {
        orderId = p.id;
        break;
      }
    }

    if (orderId) {
      await conn.execute(`UPDATE orders SET amount = ?, provider = ?, provider_ref = NULL, error_message = NULL, ${BILLING_COLUMNS} WHERE id = ?`, [
        input.total, input.provider, ...billingValues(input.billing, input.ip), orderId,
      ]);
      await conn.execute("DELETE FROM order_items WHERE order_id = ?", [orderId]); // fiyatlar yeniden yazılır
    } else {
      const [res] = await conn.execute<ResultSetHeader>("INSERT INTO orders (user_id, plan, amount, provider) VALUES (?, 'cart', ?, ?)", [input.userId, input.total, input.provider]);
      orderId = res.insertId;
      await conn.execute(`UPDATE orders SET ${BILLING_COLUMNS} WHERE id = ?`, [...billingValues(input.billing, input.ip), orderId]);
    }
    await conn.execute("UPDATE orders SET coupon_id = ?, coupon_code = ?, discount_amount = ? WHERE id = ?", [input.coupon?.id ?? null, input.coupon?.code ?? null, input.discount ?? 0, orderId]);
    await insertItems(conn, orderId, input.lines);
    await conn.commit();
    return orderId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function insertItems(conn: PoolConnection, orderId: number, lines: QuoteLine[]) {
  for (const l of lines) {
    await conn.execute("INSERT INTO order_items (order_id, item_type, course_id, program_id, title, unit_price) VALUES (?, ?, ?, ?, ?, ?)", [
      orderId, l.item.type, l.courseId, l.item.type === "program" ? l.programId : null, l.title, l.price,
    ]);
  }
}

/**
 * Şirket kontenjan siparişi: tek kalemli (`seats`), `orders.company_id` dolu. `unit_price` SATIR TOPLAMIDIR (fiyat × adet),
 * böylece makbuz ve sipariş detayı kalemlerin toplamını göstermeye devam eder. Ödenince `fulfillOrder` şirketin kontenjanını artırır.
 */
export async function createSeatOrder(i: {
  userId: number;
  companyId: number;
  courseId: number;
  title: string;
  quantity: number;
  total: number;
  billing: Billing;
  provider: string;
  ip: string;
}): Promise<number> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.execute<ResultSetHeader>("INSERT INTO orders (user_id, plan, amount, provider, company_id) VALUES (?, 'cart', ?, ?, ?)", [i.userId, i.total, i.provider, i.companyId]);
    const orderId = res.insertId;
    await conn.execute(`UPDATE orders SET ${BILLING_COLUMNS} WHERE id = ?`, [...billingValues(i.billing, i.ip), orderId]);
    await conn.execute("INSERT INTO order_items (order_id, item_type, course_id, title, unit_price, quantity) VALUES (?, 'seats', ?, ?, ?, ?)", [orderId, i.courseId, i.title, i.total, i.quantity]);
    await conn.commit();
    return orderId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

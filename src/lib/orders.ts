import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import type { Billing } from "@/lib/checkout-schema";
import { normalizePhone } from "@/lib/checkout-schema";
import type { QuoteLine } from "@/lib/cart-quote";

const itemKey = (l: { item_type: string; course_id: number | null }) => (l.item_type === "plus" ? "plus" : `course:${l.course_id}`);
const lineKey = (l: QuoteLine) => (l.item.type === "plus" ? "plus" : `course:${l.courseId}`);

type OrderInput = {
  userId: number;
  lines: QuoteLine[];
  total: number;
  billing: Billing;
  provider: string;
  ip: string;
};

const BILLING_COLUMNS = `invoice_type = ?, full_name = ?, email = ?, phone = ?, tckn = ?, company_name = ?, tax_office = ?, tax_number = ?,
  address = ?, city = ?, district = ?, zip_code = ?, consents_accepted_at = NOW(), consent_ip = ?`;

function billingValues(b: Billing, ip: string) {
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

    const [pending] = await conn.query<RowDataPacket[]>("SELECT id FROM orders WHERE user_id = ? AND plan = 'cart' AND status = 'pending' ORDER BY id DESC LIMIT 20 FOR UPDATE", [input.userId]);
    let orderId: number | undefined;
    for (const p of pending) {
      const [items] = await conn.query<RowDataPacket[]>("SELECT item_type, course_id FROM order_items WHERE order_id = ?", [p.id]);
      if ((items as { item_type: string; course_id: number | null }[]).map(itemKey).sort().join("|") === wanted) {
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
    await conn.execute("INSERT INTO order_items (order_id, item_type, course_id, title, unit_price) VALUES (?, ?, ?, ?, ?)", [
      orderId, l.item.type, l.courseId, l.title, l.price,
    ]);
  }
}

import "server-only";
import type { ResultSetHeader } from "mysql2/promise";
import pool from "@/lib/db";
import type { Billing } from "@/lib/checkout-schema";
import { BILLING_COLUMNS, billingValues } from "@/lib/orders";

/**
 * Şirket program kontenjanı siparişi: tek kalem `program_seats`, `unit_price` SATIR TOPLAMI, `quantity` adet (kurs kontenjanı
 * siparişiyle aynı kalıp). Ödeme onaylanınca `fulfillOrder` şirketin program havuzunu artırır; program kaydı açılmaz.
 */
export async function createProgramSeatOrder(i: {
  userId: number;
  companyId: number;
  programId: number;
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
    await conn.execute("INSERT INTO order_items (order_id, item_type, program_id, title, unit_price, quantity) VALUES (?, 'program_seats', ?, ?, ?, ?)", [orderId, i.programId, i.title, i.total, i.quantity]);
    await conn.commit();
    return orderId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

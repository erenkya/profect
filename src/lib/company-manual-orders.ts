import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { seatOrderTitle } from "@/lib/company-rules";
import { programSeatOrderTitle } from "@/lib/program-seat-rules";
import { VAT_PERCENT } from "@/lib/vat";

/** Havaleyle gelen tutardan (KDV dahil) kalem satır toplamını (KDV hariç) çıkarır: `orderVat` ile aynı bölünme (brüt − net = KDV). */
export const netFromGross = (gross: number): number => Math.round((gross * 100) / (1 + VAT_PERCENT / 100)) / 100;

export type ManualSeatOrderResult = { ok: true; orderId: number } | { ok: false; reason: "no_admin" | "no_target" };

/**
 * Ana adminin havaleyle tahsil ettiği kontenjanı SİPARİŞ olarak kaydeder (`provider = 'manual'`, bekleyen sipariş): iade talebi
 * sipariş üzerinden açıldığı için kayıt gerekir. Sipariş şirketin en eski aktif adminine yazılır (kart siparişlerinde de siparişi
 * veren görür). Kontenjanı ve ödendi durumunu çağıran `fulfillOrder` ile verir: admin panelinde siparişi onaylamakla aynı yol.
 * Fatura onayı/rıza alanları boş kalır: sipariş sitede verilmedi.
 */
export async function createManualSeatOrder(i: { companyId: number; kind: "course" | "program"; targetId: number; quantity: number; grossAmount: number }): Promise<ManualSeatOrderResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [owner] = await conn.query<RowDataPacket[]>(
      `SELECT u.id, u.full_name, u.email, c.name AS company_name, c.tax_office, c.tax_number
         FROM company_members m JOIN users u ON u.id = m.user_id JOIN companies c ON c.id = m.company_id
        WHERE m.company_id = ? AND m.role = 'admin' AND m.status = 'active' ORDER BY m.id LIMIT 1`,
      [i.companyId],
    );
    if (!owner[0]) {
      await conn.rollback();
      return { ok: false, reason: "no_admin" };
    }
    const [target] = await conn.query<RowDataPacket[]>(i.kind === "program" ? "SELECT title FROM programs WHERE id = ?" : "SELECT title FROM courses WHERE id = ?", [i.targetId]);
    if (!target[0]) {
      await conn.rollback();
      return { ok: false, reason: "no_target" };
    }
    const o = owner[0];
    const title = i.kind === "program" ? programSeatOrderTitle(target[0].title, i.quantity) : seatOrderTitle(target[0].title, i.quantity);
    const [res] = await conn.execute<ResultSetHeader>(
      `INSERT INTO orders (user_id, plan, amount, provider, company_id, invoice_type, full_name, email, company_name, tax_office, tax_number)
       VALUES (?, 'cart', ?, 'manual', ?, 'kurumsal', ?, ?, ?, ?, ?)`,
      [o.id, i.grossAmount, i.companyId, o.full_name, o.email, o.company_name, o.tax_office, o.tax_number],
    );
    await conn.execute(
      i.kind === "program"
        ? "INSERT INTO order_items (order_id, item_type, program_id, title, unit_price, quantity) VALUES (?, 'program_seats', ?, ?, ?, ?)"
        : "INSERT INTO order_items (order_id, item_type, course_id, title, unit_price, quantity) VALUES (?, 'seats', ?, ?, ?, ?)",
      [res.insertId, i.targetId, title, netFromGross(i.grossAmount), i.quantity],
    );
    await conn.commit();
    return { ok: true, orderId: res.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

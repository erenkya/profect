import "server-only";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { formatDate } from "@/lib/format";
import { sendOrderReceiptEmail } from "@/lib/mail";
import { orderVat } from "@/lib/vat";

/**
 * Ödenmiş siparişin özetini alıcıya e-postalar. Mail hatası ödemeyi/erişimi etkilemesin diye asla fırlatmaz.
 * fulfillOrder idempotent olduğundan yalnızca "ilk kez ödendi" geçişinde çağrılır.
 */
export async function sendOrderReceipt(orderId: number): Promise<void> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.amount, o.discount_amount, o.coupon_code, o.paid_at, o.masked_card, o.plan, o.course_id,
              o.company_name, o.tax_office, o.tax_number,
              COALESCE(o.full_name, u.full_name) AS full_name, COALESCE(o.email, u.email) AS email
         FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
      [orderId],
    );
    const o = rows[0];
    if (!o?.email) return;
    const [items] = await pool.query<RowDataPacket[]>("SELECT title, unit_price FROM order_items WHERE order_id = ? ORDER BY id", [orderId]);
    // Eski tek kalemli siparişlerde kalem satırı yoktur: kurs adı/plan üzerinden türetilir.
    let lines = (items as { title: string; unit_price: string }[]).map((i) => ({ title: i.title, price: Number(i.unit_price) }));
    if (!lines.length) {
      const [c] = o.course_id ? await pool.query<RowDataPacket[]>("SELECT title FROM courses WHERE id = ?", [o.course_id]) : [[]];
      lines = [{ title: o.plan === "plus" ? "Profect Plus (30 gün)" : (c[0]?.title ?? "Kurs"), price: Number(o.amount) + Number(o.discount_amount ?? 0) }];
    }
    await sendOrderReceiptEmail({
      orderNo: o.id,
      paidAt: formatDate(o.paid_at),
      buyer: { name: o.full_name, email: o.email, companyName: o.company_name, taxOffice: o.tax_office, taxNumber: o.tax_number },
      items: lines,
      discount: Number(o.discount_amount ?? 0),
      couponCode: o.coupon_code,
      vat: orderVat(Number(o.amount), lines.reduce((s, l) => s + l.price, 0), Number(o.discount_amount ?? 0)),
      total: Number(o.amount),
      maskedCard: o.masked_card,
      url: `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}/hesabim/kurslarim`,
    });
  } catch (err) {
    console.error("[order-receipt] e-posta gönderilemedi", { orderId, err });
  }
}

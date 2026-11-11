import "server-only";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { ORDER_GIFT_TO_SQL } from "@/lib/lms";
import { sendNewOrderNotificationEmail } from "@/lib/mail";

/**
 * Ödemesi alınmamış (manual) yeni sipariş için bildirimi gönderir: müşteri iletişim bilgisi + sipariş içeriği.
 * Bildirim başarısız olsa da sipariş geçerlidir (müşteri hata görmez); hata yalnızca loglanır, sipariş admin panelinde zaten görünür.
 */
export async function notifyNewOrder(orderId: number, baseUrl: string): Promise<void> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.amount, o.coupon_code, o.discount_amount, o.invoice_type, o.full_name, o.email, o.phone,
              o.company_name, o.tax_office, o.tax_number, o.address, o.city, o.district,
              DATE_FORMAT(o.created_at, '%d.%m.%Y %H:%i') AS created_at, ${ORDER_GIFT_TO_SQL} AS gift_to,
              u.full_name AS user_name, u.email AS user_email
         FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`,
      [orderId],
    );
    const o = rows[0];
    if (!o) return;
    const [items] = await pool.query<RowDataPacket[]>("SELECT title FROM order_items WHERE order_id = ? ORDER BY id", [orderId]);
    await sendNewOrderNotificationEmail({
      orderNo: o.id,
      createdAt: o.created_at,
      customer: { name: o.full_name ?? o.user_name, accountEmail: o.user_email, billingEmail: o.email ?? o.user_email, phone: o.phone },
      invoice: o.invoice_type
        ? { type: o.invoice_type, companyName: o.company_name, taxOffice: o.tax_office, taxNumber: o.tax_number, address: o.address ? `${o.address}, ${o.district}/${o.city}` : null }
        : null,
      items: items.map((i) => i.title),
      giftTo: o.gift_to,
      couponCode: o.coupon_code,
      discount: Number(o.discount_amount),
      total: Number(o.amount),
      adminUrl: `${baseUrl}/admin/siparisler`,
    });
  } catch (err) {
    console.error(`[order-notify] #${orderId} bildirimi gönderilemedi:`, err);
  }
}

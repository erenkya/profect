import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, serverError } from "@/lib/http";
import { ORDER_ITEMS_SUMMARY_SQL } from "@/lib/lms";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.plan, o.amount, o.currency, o.status, o.provider, o.created_at, o.paid_at,
              o.invoice_type, o.company_name, o.tckn, o.tax_number, o.tax_office, o.phone, o.address, o.city, o.district, o.error_message, o.coupon_code, o.discount_amount,
            ${ORDER_ITEMS_SUMMARY_SQL} AS items_summary,
              u.full_name AS user_name, u.email AS user_email, c.title AS course_title
         FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN courses c ON c.id = o.course_id
        ORDER BY o.created_at DESC LIMIT 500`,
    );
    return ok({ data: rows });
  } catch (err) {
    return serverError("[GET /api/admin/orders]", err);
  }
}

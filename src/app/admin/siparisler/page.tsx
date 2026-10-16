import type { RowDataPacket } from "mysql2";
import { OrdersTable, type OrderRow } from "@/components/admin/OrdersTable";
import pool from "@/lib/db";

export const metadata = { title: "Siparişler" };

export default async function AdminOrders() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT o.id, o.plan, o.amount, o.status, o.provider, o.created_at, o.paid_at,
            u.full_name AS user_name, u.email AS user_email, c.title AS course_title
       FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN courses c ON c.id = o.course_id
      ORDER BY (o.status = 'pending') DESC, o.created_at DESC LIMIT 500`,
  );
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 12px" }}>Siparişler</h1>
      <p style={{ color: "var(--muted-72)", marginBottom: 24 }}>Online ödeme sağlayıcısı bağlanana kadar siparişler burada elle onaylanır; onay, kullanıcıya erişimi açar.</p>
      <OrdersTable orders={rows as OrderRow[]} />
    </>
  );
}

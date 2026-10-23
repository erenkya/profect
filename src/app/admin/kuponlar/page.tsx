import type { RowDataPacket } from "mysql2";
import { CouponsPanel, type CouponRowView } from "@/components/admin/CouponsPanel";
import pool from "@/lib/db";

export const metadata = { title: "Kuponlar" };

export default async function AdminCoupons() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.code, c.discount_type, c.discount_value, c.max_uses, c.max_uses_per_user, c.is_active,
            DATE_FORMAT(c.valid_from, '%Y-%m-%d') AS valid_from, DATE_FORMAT(c.valid_until, '%Y-%m-%d') AS valid_until,
            (c.valid_until IS NOT NULL AND c.valid_until < NOW()) AS expired,
            (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS uses,
            (SELECT COALESCE(SUM(r.discount_amount), 0) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS total_discount
       FROM coupons c ORDER BY c.id DESC LIMIT 500`,
  );
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 12px" }}>Kuponlar</h1>
      <p style={{ color: "var(--muted-72)", marginBottom: 24 }}>Kuponlar ödeme sayfasında sepet toplamına uygulanır. Kullanım, siparişin ödenmesiyle (ya da admin onayıyla) sayılır.</p>
      <CouponsPanel coupons={rows.map((r) => ({ ...r, discount_value: Number(r.discount_value), total_discount: Number(r.total_discount), uses: Number(r.uses), is_active: !!r.is_active, expired: !!r.expired })) as CouponRowView[]} />
    </>
  );
}

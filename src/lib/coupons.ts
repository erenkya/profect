import "server-only";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { normalizeCouponCode } from "@/lib/coupon-schema";

export type CouponRow = {
  id: number;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_uses: number | null;
  max_uses_per_user: number | null;
};

export type CouponValidation = { ok: true; coupon: CouponRow } | { ok: false; message: string };

/**
 * Kuponu doğrular: var mı, aktif mi, tarih aralığında mı, kullanım limitleri doldu mu.
 * Tarih karşılaştırması DB saatiyle (NOW()) yapılır. Kullanım yalnızca ödenmiş siparişlerden (coupon_redemptions) sayılır.
 * Ön izleme (/api/checkout/coupon) ve sipariş oluşturma (/api/checkout) aynı fonksiyonu kullanır.
 */
export async function validateCoupon(params: { code: string; userId: number }): Promise<CouponValidation> {
  const code = normalizeCouponCode(params.code);
  if (!code) return { ok: false, message: "Kupon kodunu girin." };

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, code, discount_type, discount_value, max_uses, max_uses_per_user, is_active,
            (valid_from IS NOT NULL AND valid_from > NOW()) AS not_yet,
            (valid_until IS NOT NULL AND valid_until < NOW()) AS expired
       FROM coupons WHERE code = ? LIMIT 1`,
    [code],
  );
  const c = rows[0];
  if (!c || !c.is_active) return { ok: false, message: "Geçersiz kupon kodu." };
  if (c.not_yet) return { ok: false, message: "Bu kupon henüz geçerli değil." };
  if (c.expired) return { ok: false, message: "Bu kuponun süresi dolmuş." };

  if (c.max_uses !== null) {
    const [r] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ?", [c.id]);
    if (Number(r[0].n) >= c.max_uses) return { ok: false, message: "Bu kuponun kullanım limiti dolmuş." };
  }
  if (c.max_uses_per_user !== null) {
    const [r] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?", [c.id, params.userId]);
    if (Number(r[0].n) >= c.max_uses_per_user) return { ok: false, message: "Bu kuponu daha önce kullandınız." };
  }
  return {
    ok: true,
    coupon: { id: c.id, code: c.code, discount_type: c.discount_type, discount_value: Number(c.discount_value), max_uses: c.max_uses, max_uses_per_user: c.max_uses_per_user },
  };
}

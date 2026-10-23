import { NextResponse, type NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { fulfillOrder } from "@/lib/lms";
import { complete3DS, verifyCallbackSignature, type TamiCallbackPayload } from "@/lib/payment/tami";

// Banka 3D doğrulamasından sonra tarayıcıyı buraya POST ile yönlendirir. İmzayı doğrular, /payment/complete-3ds ile
// tahsilatı tamamlar, siparişi "ödendi" yapıp erişimi açar (fulfillOrder idempotenttir), sonra sonuç sayfasına yönlendirir.

const done = (req: NextRequest, orderId: number | null) => {
  const url = new URL("/odeme/sonuc", process.env.APP_URL || req.url);
  if (orderId) url.searchParams.set("orderId", String(orderId));
  return NextResponse.redirect(url, { status: 303 });
};

async function reject(ref: string, message: string) {
  await pool.execute("UPDATE orders SET status = 'rejected', error_message = ? WHERE provider_ref = ? AND status = 'pending'", [message.slice(0, 255), ref]);
}

export async function POST(req: NextRequest) {
  const payload = Object.fromEntries((await req.formData()).entries()) as unknown as TamiCallbackPayload;
  const ref = typeof payload.orderId === "string" ? payload.orderId : "";
  if (!ref) return NextResponse.json({ success: false, message: "orderId eksik." }, { status: 400 });

  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, amount, status FROM orders WHERE provider_ref = ? LIMIT 1", [ref]);
  const order = rows[0];
  if (!order) return NextResponse.json({ success: false, message: "Sipariş bulunamadı." }, { status: 404 });

  const secret = process.env.TAMI_SECRET_KEY;
  if (String(payload.success) !== "true" || !secret || !verifyCallbackSignature(payload, secret)) {
    await reject(ref, !secret || String(payload.success) === "true" ? "callback_signature_mismatch" : "3d_not_authenticated");
    return done(req, order.id);
  }
  if (order.status === "paid") return done(req, order.id);

  try {
    const data = await complete3DS(ref);
    if (!data.success) {
      await reject(ref, data.errorMessage || "payment_failed");
      return done(req, order.id);
    }
    // Banka tutarı sipariş tutarıyla eşleşmiyorsa erişim AÇILMAZ (manuel inceleme için kayıt bekler).
    if (Math.round(Number(data.amount) * 100) !== Math.round(Number(order.amount) * 100)) {
      await pool.execute("UPDATE orders SET error_message = 'amount_mismatch', bank_auth_code = ? WHERE id = ?", [data.bankAuthCode, order.id]);
      console.error("[tami-callback] tutar uyuşmazlığı", { orderId: order.id, bank: data.amount, expected: order.amount });
      return done(req, order.id);
    }
    await pool.execute<ResultSetHeader>("UPDATE orders SET bank_auth_code = ?, masked_card = ?, error_message = NULL WHERE id = ?", [data.bankAuthCode, data.card.maskedNumber, order.id]);
    await fulfillOrder(order.id);
    return done(req, order.id);
  } catch (err) {
    console.error("[tami-callback] complete-3ds başarısız", err);
    await reject(ref, "network_error");
    return done(req, order.id);
  }
}

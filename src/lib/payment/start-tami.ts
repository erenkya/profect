import "server-only";
import type { z } from "zod";
import pool from "@/lib/db";
import { normalizePhone, type Billing, type cardSchema } from "@/lib/checkout-schema";
import { authPayment3D } from "@/lib/payment/tami";

type Card = z.infer<typeof cardSchema>;

/**
 * Tami 3D Secure ödemesini başlatır: siparişe benzersiz bir provider_ref yazar, bankaya 3D isteğini yollar.
 * Başarısızlıkta sipariş "rejected" olur. `basket[].price` çağıranın hesapladığı NET (kupon sonrası) fiyattır.
 */
export async function startTamiCheckout(a: {
  orderId: number;
  total: number;
  billing: Billing;
  card: Card;
  ip: string;
  userId: number;
  baseUrl: string;
  basket: { key: string; title: string; subCategory: "Kurs" | "Abonelik"; price: number }[];
}): Promise<{ ok: true; threeDSHtmlContent: string } | { ok: false; message: string }> {
  const { orderId, total, billing, card, ip, userId } = a;
  const [mm, yy] = card.expiry.split("/").map(Number);
  const ref = `PRF${orderId}T${Date.now()}`; // her deneme Tami'de benzersiz olmalı
  await pool.execute("UPDATE orders SET provider_ref = ? WHERE id = ?", [ref, orderId]);
  const [first, ...rest] = billing.full_name.split(/\s+/);
  const now = new Date().toISOString().replace("Z", "");
  // Bireysel faturada adres/telefon/TCKN alınmaz; Tami'nin zorunlu alanları için sabit yer tutucular kullanılır.
  // TODO: yeni Tami hesabı bireysel için bu alanları kabul etmezse formda yeniden istenmeli.
  const k = billing.invoice_type === "kurumsal" ? billing : null;
  const phone = k ? normalizePhone(k.phone)! : "5000000000";
  const address = {
    address: k?.address ?? "Dijital ürün (adres alınmadı)", city: k?.city ?? "İstanbul", district: k?.district ?? "Merkez", country: "Türkiye", zipCode: k?.zip_code ?? "34000",
    companyName: k?.company_name,
    contactName: billing.full_name, phoneNumber: phone, emailAddress: billing.email,
  };
  const data = await authPayment3D({
    orderId: ref,
    amount: total,
    currency: "TRY",
    installmentCount: 1,
    paymentGroup: "PRODUCT",
    paymentChannel: "WEB",
    callbackUrl: `${(process.env.APP_URL || a.baseUrl).replace(/\/+$/, "")}/api/checkout/tami-callback`,
    card: { number: card.number, holderName: card.holder_name, expireMonth: mm, expireYear: 2000 + yy, cvv: card.cvv },
    buyer: {
      ipAddress: ip, buyerId: String(userId), name: first, surName: rest.join(" ") || first,
      identityNumber: k?.tax_number ?? "11111111111",
      emailAddress: billing.email, phoneNumber: phone, city: address.city, country: "Türkiye", zipCode: address.zipCode,
      registrationAddress: address.address, registrationDate: now, lastLoginDate: now,
    },
    billingAddress: address,
    shippingAddress: address,
    basket: {
      basketId: ref,
      basketItems: a.basket.map((l) => ({ itemId: l.key, name: l.title.slice(0, 100), itemType: "PHYSICAL" as const, category: "Eğitim", subCategory: l.subCategory, numberOfProducts: 1, unitPrice: l.price, totalPrice: l.price })),
    },
  });
  if (!data.success) {
    await pool.execute("UPDATE orders SET status = 'rejected', error_message = ? WHERE id = ?", [String(data.errorMessage).slice(0, 255), orderId]);
    return { ok: false, message: data.errorMessage || "Ödeme başlatılamadı." };
  }
  return { ok: true, threeDSHtmlContent: data.threeDSHtmlContent };
}

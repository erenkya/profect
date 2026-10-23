import test from "node:test";
import assert from "node:assert/strict";
import { billingSchema, cardSchema, checkoutSchema, isValidTckn, luhn, normalizePhone } from "./checkout-schema.ts";

const base = { full_name: "Ayşe Yılmaz", email: "Ayse@Example.com", phone: "0532 123 45 67", address: "Atatürk Cd. No:1 D:2", city: "İstanbul", district: "Kadıköy", zip_code: "34700" };
const consents = { distance_sales: true, privacy: true, delivery_return: true, kvkk: true };

test("TCKN algoritması", () => {
  assert.equal(isValidTckn("10000000146"), true);
  assert.equal(isValidTckn("10000000147"), false); // sağlama hanesi bozuk
  assert.equal(isValidTckn("00000000000"), false);
  assert.equal(isValidTckn("1234567890"), false);
});

test("telefon normalleştirme", () => {
  assert.equal(normalizePhone("0532 123 45 67"), "5321234567");
  assert.equal(normalizePhone("+90 532 123 45 67"), "5321234567");
  assert.equal(normalizePhone("212 123 45 67"), null);
});

test("Luhn", () => {
  assert.equal(luhn("4111111111111111"), true);
  assert.equal(luhn("4111111111111112"), false);
});

test("bireysel fatura yalnızca ad ve e-posta ister; kurumsal tam bilgi ister", () => {
  assert.equal(billingSchema.safeParse({ invoice_type: "bireysel", full_name: base.full_name, email: base.email }).success, true);
  assert.equal(billingSchema.safeParse({ invoice_type: "bireysel", full_name: base.full_name, email: "gecersiz" }).success, false);
  const corp = { ...base, invoice_type: "kurumsal", company_name: "Acme A.Ş.", tax_office: "Kadıköy", tax_number: "1234567890" };
  assert.equal(billingSchema.safeParse(corp).success, true);
  assert.equal(billingSchema.safeParse({ ...corp, tax_number: "123" }).success, false);
  assert.equal(billingSchema.safeParse({ ...corp, address: "" }).success, false);
  assert.equal(billingSchema.safeParse({ ...corp, phone: "" }).success, false);
});

test("dört onayın hepsi zorunlu", () => {
  const ok = { items: [{ type: "plus" }], billing: { invoice_type: "bireysel", full_name: base.full_name, email: base.email }, consents };
  assert.equal(checkoutSchema.safeParse(ok).success, true);
  for (const k of Object.keys(consents)) {
    assert.equal(checkoutSchema.safeParse({ ...ok, consents: { ...consents, [k]: false } }).success, false, k);
  }
  assert.equal(checkoutSchema.safeParse({ ...ok, items: [] }).success, false);
});

test("kart şeması boşlukları temizler, geçersiz numarayı reddeder", () => {
  const card = { holder_name: "Ayşe Yılmaz", number: "4111 1111 1111 1111", expiry: "12/30", cvv: "123" };
  const parsed = cardSchema.safeParse(card);
  assert.equal(parsed.success && parsed.data.number, "4111111111111111");
  assert.equal(cardSchema.safeParse({ ...card, number: "4111 1111 1111 1112" }).success, false);
  assert.equal(cardSchema.safeParse({ ...card, expiry: "13/30" }).success, false);
});

import { cvcLength, detectCardBrand, formatCardNumber, formatExpiry, isValidExpiry } from "./card-brand.ts";

test("kart ağı tespiti ve biçimlendirme", () => {
  assert.equal(detectCardBrand("4111 1111"), "visa");
  assert.equal(detectCardBrand("5555 4444"), "mastercard");
  assert.equal(detectCardBrand("2221 00"), "mastercard");
  assert.equal(detectCardBrand("3782 822463"), "amex");
  assert.equal(detectCardBrand("9792 0300"), "troy");
  assert.equal(detectCardBrand("1234"), null);
  assert.equal(formatCardNumber("378282246310005"), "3782 822463 10005");
  assert.equal(formatCardNumber("4111111111111111"), "4111 1111 1111 1111");
});

test("son kullanma yazarken ay 01-12 dışına çıkamaz", () => {
  assert.equal(formatExpiry("5"), "05");
  assert.equal(formatExpiry("13"), "1");
  assert.equal(formatExpiry("00"), "0");
  assert.equal(formatExpiry("1"), "1");
  assert.equal(formatExpiry("12"), "12");
  assert.equal(formatExpiry("1228"), "12/28");
  assert.equal(formatExpiry("12/2899"), "12/28");
  assert.equal(formatExpiry("0929"), "09/29");
  assert.equal(formatExpiry("9"), "09");
});

test("son kullanma geçmişte ya da çok ileride olamaz", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  assert.equal(isValidExpiry("10/26", now), true); // bu ay dahil
  assert.equal(isValidExpiry("09/26", now), false);
  assert.equal(isValidExpiry("12/25", now), false);
  assert.equal(isValidExpiry("12/46", now), true);
  assert.equal(isValidExpiry("12/47", now), false);
  assert.equal(isValidExpiry("13/28", now), false);
  assert.equal(isValidExpiry("1/28", now), false);
});

test("numara ve CVC uzunluk sınırları kart ağına göre", () => {
  assert.equal(formatCardNumber("41111111111111111111"), "4111 1111 1111 1111"); // Visa 16'da biter
  assert.equal(formatCardNumber("37828224631000599"), "3782 822463 10005");        // Amex 15'te biter
  assert.equal(cvcLength("amex"), 4);
  assert.equal(cvcLength("visa"), 3);
  assert.equal(cvcLength(null), 3);
});

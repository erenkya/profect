import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GIFT_MESSAGE_MAX,
  claimBlock,
  giftCheckoutSchema,
  isGiftToken,
  isSelfGift,
  maskEmail,
  normalizeRecipientEmail,
} from "./gift-rules.ts";

test("normalizeRecipientEmail: boşluk ve büyük harf temizlenir", () => {
  assert.equal(normalizeRecipientEmail("  Ayse@Gmail.COM "), "ayse@gmail.com");
});

test("isSelfGift: harf biçiminden bağımsız aynı adres kendine hediyedir", () => {
  assert.equal(isSelfGift("Ayse@gmail.com", " ayse@GMAIL.com"), true);
  assert.equal(isSelfGift("a@x.com", "b@x.com"), false);
});

test("isGiftToken: yalnızca 64 küçük harfli hex", () => {
  assert.equal(isGiftToken("a".repeat(64)), true);
  assert.equal(isGiftToken("0123456789abcdef".repeat(4)), true);
  assert.equal(isGiftToken("A".repeat(64)), false);
  assert.equal(isGiftToken("a".repeat(63)), false);
  assert.equal(isGiftToken("a".repeat(65)), false);
  assert.equal(isGiftToken("../" + "a".repeat(61)), false);
  assert.equal(isGiftToken(""), false);
  assert.equal(isGiftToken(undefined), false);
  assert.equal(isGiftToken(123), false);
});

test("maskEmail: ilk harf ve alan adı kalır", () => {
  assert.equal(maskEmail("ayse@gmail.com"), "a***@gmail.com");
  assert.equal(maskEmail("a@x.com"), "a***@x.com");
  assert.equal(maskEmail("bozuk"), "***");
});

const live = { status: "pending", secondsLeft: 100, recipientEmail: "ayse@gmail.com" } as const;
const ayse = { email: "ayse@gmail.com", emailVerified: true };

test("claimBlock: eşleşen doğrulanmış hesap hediyeyi alabilir", () => {
  assert.equal(claimBlock(live, ayse, false), null);
  assert.equal(claimBlock(live, { email: "  AYSE@gmail.com", emailVerified: true }, false), null);
});

test("claimBlock: farklı mail wrong_account, doğrulanmamış unverified, sahip olan already_owned", () => {
  assert.equal(claimBlock(live, { email: "baska@gmail.com", emailVerified: true }, false), "wrong_account");
  assert.equal(claimBlock(live, { ...ayse, emailVerified: false }, false), "unverified");
  assert.equal(claimBlock(live, ayse, true), "already_owned");
});

test("claimBlock: yok, süresi geçmiş ya da pending olmayan hediye invalid", () => {
  assert.equal(claimBlock(null, ayse, false), "invalid");
  assert.equal(claimBlock({ ...live, secondsLeft: 0 }, ayse, false), "invalid");
  assert.equal(claimBlock({ ...live, secondsLeft: -5 }, ayse, false), "invalid");
  for (const status of ["awaiting_payment", "claimed", "expired", "cancelled"] as const) {
    assert.equal(claimBlock({ ...live, status }, ayse, false), "invalid", status);
  }
});

const validBody = {
  slug: "etik-hacking",
  recipient_email: "  Yeni@Example.COM ",
  billing: { invoice_type: "bireysel", full_name: "Ayşe Yılmaz", email: "ayse@example.com" },
  consents: { distance_sales: true, privacy: true, delivery_return: true, kvkk: true },
};

test("giftCheckoutSchema: geçerli gövde parse olur, alıcı maili küçük harfe döner", () => {
  const r = giftCheckoutSchema.safeParse(validBody);
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.recipient_email, "yeni@example.com");
});

test("giftCheckoutSchema: not sınırı, bozuk mail, boş slug ve eksik onay reddedilir", () => {
  assert.equal(giftCheckoutSchema.safeParse({ ...validBody, message: "a".repeat(GIFT_MESSAGE_MAX) }).success, true);
  assert.equal(giftCheckoutSchema.safeParse({ ...validBody, message: "a".repeat(GIFT_MESSAGE_MAX + 1) }).success, false);
  assert.equal(giftCheckoutSchema.safeParse({ ...validBody, recipient_email: "abc" }).success, false);
  assert.equal(giftCheckoutSchema.safeParse({ ...validBody, slug: "" }).success, false);
  assert.equal(giftCheckoutSchema.safeParse({ ...validBody, consents: { ...validBody.consents, kvkk: false } }).success, false);
});

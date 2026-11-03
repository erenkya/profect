import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WATCH_MIN_BYTES,
  allocationBlock,
  assignBlock,
  canRemoveAdmin,
  corporateEmailBlock,
  emailDomain,
  generateCompanyCode,
  isCompanyCode,
  isPublicDomain,
  isWatched,
  normalizeCompanyCode,
  normalizeDomain,
  progressStatus,
  seatOrderResultView,
  reclaimOutcome,
  seatCheckoutSchema,
  seatOrderTitle,
  signupFieldsSchema,
} from "./company-rules.ts";

test("generateCompanyCode: ön ek Türkçe harfleri sadeleştirir", () => {
  assert.equal(generateCompanyCode("Ağaç Yazılım A.Ş.", () => 0), "AGAC-2222");
  assert.equal(generateCompanyCode("Acme A.Ş.", () => 0), "ACME-2222");
  assert.ok(generateCompanyCode("123", () => 0).startsWith("FRM-"));
  assert.match(generateCompanyCode("Acme"), /^[A-Z]{2,6}-[2-9A-HJ-NP-Z]{4}$/);
});

test("normalizeCompanyCode / isCompanyCode", () => {
  assert.equal(normalizeCompanyCode(" acme-7k4q "), "ACME-7K4Q");
  assert.equal(isCompanyCode("ACME-7K4Q"), true);
  assert.equal(isCompanyCode("ACME-0K4Q"), false);
  assert.equal(isCompanyCode("ACME7K4Q"), false);
  assert.equal(isCompanyCode(""), false);
  assert.equal(isCompanyCode(undefined), false);
});

test("normalizeDomain: @ ve büyük harf temizlenir, geçersiz null", () => {
  assert.equal(normalizeDomain("@Acme.COM "), "acme.com");
  assert.equal(normalizeDomain("acme"), null);
  assert.equal(normalizeDomain("a b.com"), null);
  assert.equal(normalizeDomain(""), null);
});

test("emailDomain", () => {
  assert.equal(emailDomain("Ali@Acme.com"), "acme.com");
  assert.equal(emailDomain("bozuk"), null);
});

test("isPublicDomain: genel posta sağlayıcıları", () => {
  for (const d of ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "yandex.com", "proton.me"]) assert.equal(isPublicDomain(d), true, d);
  assert.equal(isPublicDomain("acme.com"), false);
});

test("corporateEmailBlock: e-posta uzantısı şirket uzantısıyla aynı olmalı", () => {
  assert.equal(corporateEmailBlock("ali@acme.com", "acme.com"), null);
  assert.equal(corporateEmailBlock("ali@gmail.com", "acme.com"), "domain_mismatch");
});

const company = { company_name: "Acme A.Ş.", tax_office: "Kadıköy", tax_number: "1234567890", domain: "@Acme.com" };

test("signupFieldsSchema: bireysel", () => {
  assert.equal(signupFieldsSchema.safeParse({ account_type: "bireysel" }).success, true);
  assert.equal(signupFieldsSchema.safeParse({ account_type: "bireysel", company_code: "acme-7k4q" }).success, true);
  assert.equal(signupFieldsSchema.safeParse({ account_type: "bireysel", company_code: "kötü" }).success, false);
});

test("signupFieldsSchema: kurumsal", () => {
  const ok = signupFieldsSchema.safeParse({ account_type: "kurumsal", company });
  assert.equal(ok.success, true);
  if (ok.success && ok.data.account_type === "kurumsal") assert.equal(ok.data.company.domain, "acme.com");
  assert.equal(signupFieldsSchema.safeParse({ account_type: "kurumsal", company: { ...company, domain: "gmail.com" } }).success, false);
  assert.equal(signupFieldsSchema.safeParse({ account_type: "kurumsal", company: { ...company, tax_number: "123" } }).success, false);
});

test("assignBlock: sıra not_member → burned → already_owned → no_free", () => {
  const ok = { free: 1, member: "active" as const, burned: false, alreadyHasAccess: false };
  assert.equal(assignBlock(ok), null);
  assert.equal(assignBlock({ ...ok, member: "other" }), "not_member");
  assert.equal(assignBlock({ ...ok, burned: true }), "burned");
  assert.equal(assignBlock({ ...ok, alreadyHasAccess: true }), "already_owned");
  assert.equal(assignBlock({ ...ok, free: 0 }), "no_free");
  assert.equal(assignBlock({ ...ok, member: "other", free: 0 }), "not_member");
});

test("isWatched: tamamlanmış ders ya da eşik üstü akış", () => {
  assert.equal(isWatched({ completedLessons: 0, streamBytes: 0 }), false);
  assert.equal(isWatched({ completedLessons: 1, streamBytes: 0 }), true);
  assert.equal(isWatched({ completedLessons: 0, streamBytes: WATCH_MIN_BYTES }), true);
  assert.equal(isWatched({ completedLessons: 0, streamBytes: WATCH_MIN_BYTES - 1 }), false);
});

test("reclaimOutcome", () => {
  assert.equal(reclaimOutcome(false, false), "return");
  assert.equal(reclaimOutcome(false, true), "return");
  assert.equal(reclaimOutcome(true, false), "needs_confirm");
  assert.equal(reclaimOutcome(true, true), "burn");
});

test("allocationBlock: sıfır ve kullanılanın altına inen delta reddedilir", () => {
  assert.equal(allocationBlock({ currentTotal: 10, assigned: 6, burned: 2, delta: 0 }), "zero");
  assert.equal(allocationBlock({ currentTotal: 10, assigned: 6, burned: 2, delta: -3 }), "below_used");
  assert.equal(allocationBlock({ currentTotal: 10, assigned: 6, burned: 2, delta: -2 }), null);
  assert.equal(allocationBlock({ currentTotal: 10, assigned: 6, burned: 2, delta: 5 }), null);
});

test("canRemoveAdmin: son admin düşürülemez", () => {
  assert.equal(canRemoveAdmin(1), false);
  assert.equal(canRemoveAdmin(2), true);
});

test("progressStatus", () => {
  assert.equal(progressStatus({ completed: 0, total: 12, certificate: null }), "not_started");
  assert.equal(progressStatus({ completed: 5, total: 12, certificate: null }), "in_progress");
  assert.equal(progressStatus({ completed: 12, total: 12, certificate: null }), "completed");
  assert.equal(progressStatus({ completed: 3, total: 12, certificate: "PRF-1" }), "completed");
});

test("seatCheckoutSchema: adet 1..1000; seatOrderTitle", () => {
  const base = {
    slug: "excel",
    billing: { invoice_type: "bireysel", full_name: "Ali Veli", email: "a@x.com" },
    consents: { distance_sales: true, privacy: true, delivery_return: true, kvkk: true },
  };
  assert.equal(seatCheckoutSchema.safeParse({ ...base, quantity: 0 }).success, false);
  assert.equal(seatCheckoutSchema.safeParse({ ...base, quantity: 1001 }).success, false);
  assert.equal(seatCheckoutSchema.safeParse({ ...base, quantity: 25 }).success, true);
  assert.equal(seatOrderTitle("Excel", 25), "Excel · 25 kişilik kontenjan");
});

test("seatOrderResultView: kontenjan siparişi erişim açıldı demez, şirket paneline yönlendirir", () => {
  const paid = seatOrderResultView("paid", null);
  assert.match(paid.body, /kontenjan/i);
  assert.doesNotMatch(paid.body, /Erişimin açıldı/);
  assert.equal(paid.cta.href, "/sirket");

  const pending = seatOrderResultView("pending", null);
  assert.match(pending.body, /kontenjan/i);
  assert.doesNotMatch(pending.body, /erişimin hesabında açılacak/);
  assert.equal(pending.cta.href, "/hesabim/siparislerim");

  const rejected = seatOrderResultView("rejected", "Yetersiz bakiye");
  assert.match(rejected.body, /Yetersiz bakiye/);
  assert.notEqual(rejected.cta.href, "/sepet"); // kontenjan siparişi sepetten verilmez
  assert.equal(seatOrderResultView("rejected", null).body, "Ödeme onaylanmadı.");
});

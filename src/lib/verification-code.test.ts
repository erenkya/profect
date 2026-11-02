import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_LENGTH,
  MAX_ATTEMPTS,
  VERIFY_MESSAGES,
  codeMatches,
  generateCode,
  hashCode,
  normalizeCode,
  verifyBlock,
} from "./verification-code.ts";

const SECRET = "test-secret";

test("generateCode: her zaman 6 haneli rakam (baştaki sıfırlar korunur)", () => {
  for (let i = 0; i < 2000; i++) assert.match(generateCode(), /^\d{6}$/);
  assert.equal(CODE_LENGTH, 6);
});

test("generateCode: kodlar tekrarlanmıyor (rastgelelik makul)", () => {
  const seen = new Set(Array.from({ length: 200 }, generateCode));
  assert.ok(seen.size > 190);
});

test("normalizeCode: boşluk/tire temizlenir, geçersizler reddedilir", () => {
  assert.equal(normalizeCode("123456"), "123456");
  assert.equal(normalizeCode(" 123 456 "), "123456");
  assert.equal(normalizeCode("123-456"), "123456");
  assert.equal(normalizeCode("012345"), "012345");
  for (const bad of ["12345", "1234567", "abcdef", "12345a", "", "１２３４５６", null, undefined, 123456]) {
    assert.equal(normalizeCode(bad), null, String(bad));
  }
});

test("hashCode: deterministik, 64 hex; kod/kullanıcı/sır değişince değişir", () => {
  const h = hashCode(1, "123456", SECRET);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, hashCode(1, "123456", SECRET));
  assert.notEqual(h, hashCode(1, "123457", SECRET));
  assert.notEqual(h, hashCode(2, "123456", SECRET));
  assert.notEqual(h, hashCode(1, "123456", "baska-sir"));
});

test("codeMatches: doğru kod geçer, yanlış kod / başka kullanıcı / bozuk özet geçmez", () => {
  const stored = hashCode(7, "654321", SECRET);
  assert.equal(codeMatches(stored, 7, "654321", SECRET), true);
  assert.equal(codeMatches(stored, 7, "654322", SECRET), false);
  assert.equal(codeMatches(stored, 8, "654321", SECRET), false);
  assert.equal(codeMatches(stored, 7, "654321", "baska-sir"), false);
  assert.equal(codeMatches(null, 7, "654321", SECRET), false);
  assert.equal(codeMatches("", 7, "654321", SECRET), false);
  assert.equal(codeMatches("zz".repeat(32), 7, "654321", SECRET), false);
  assert.equal(codeMatches("abc", 7, "654321", SECRET), false);
});

test("verifyBlock: hesap yok / zaten doğrulanmış / kod yok → invalid", () => {
  assert.equal(verifyBlock(null), "invalid");
  assert.equal(verifyBlock({ emailVerified: true, hasCode: true, secondsLeft: 300, attempts: 0 }), "invalid");
  assert.equal(verifyBlock({ emailVerified: false, hasCode: false, secondsLeft: 300, attempts: 0 }), "invalid");
});

test("verifyBlock: süresi dolan kod expired, deneme hakkı bitince locked", () => {
  const base = { emailVerified: false, hasCode: true, attempts: 0, secondsLeft: 300 };
  assert.equal(verifyBlock(base), null);
  assert.equal(verifyBlock({ ...base, secondsLeft: 0 }), "expired");
  assert.equal(verifyBlock({ ...base, secondsLeft: -5 }), "expired");
  assert.equal(verifyBlock({ ...base, attempts: MAX_ATTEMPTS - 1 }), null);
  assert.equal(verifyBlock({ ...base, attempts: MAX_ATTEMPTS }), "locked");
  // Süre dolmuşsa mesaj "expired" olur (yeni kod isteme yönlendirmesi aynı).
  assert.equal(verifyBlock({ ...base, secondsLeft: 0, attempts: MAX_ATTEMPTS }), "expired");
});

test("kullanıcıya dönen mesajlar yeni kod istemeyi yönlendirir", () => {
  assert.match(VERIFY_MESSAGES.expired, /Yeni bir kod/);
  assert.match(VERIFY_MESSAGES.locked, /yeni bir kod/i);
  assert.match(VERIFY_MESSAGES.wrong(3), /3 deneme/);
});

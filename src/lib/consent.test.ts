import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_MAX_AGE_DAYS, parseConsent, readCookieValue, serializeConsent } from "./consent.ts";

const NOW = Date.UTC(2026, 10, 2);
const DAY = 24 * 60 * 60 * 1000;

test("serializeConsent → parseConsent: seçim aynen geri okunur", () => {
  assert.equal(parseConsent(serializeConsent(true, NOW), NOW)?.analytics, true);
  assert.equal(parseConsent(serializeConsent(false, NOW), NOW)?.analytics, false);
});

test("parseConsent: tercih yoksa ya da bozuksa null (varsayılan: sor ve kapalı tut)", () => {
  assert.equal(parseConsent(null, NOW), null);
  assert.equal(parseConsent("", NOW), null);
  assert.equal(parseConsent("%7Bbozuk", NOW), null);
  assert.equal(parseConsent(encodeURIComponent(JSON.stringify({ v: 1, analytics: "evet", at: NOW })), NOW), null);
});

test("parseConsent: eski sürüm tercih geçersizdir", () => {
  assert.equal(parseConsent(encodeURIComponent(JSON.stringify({ v: 0, analytics: true, at: NOW })), NOW), null);
});

test("parseConsent: süresi dolan tercih yeniden sorulur", () => {
  const old = serializeConsent(true, NOW - (CONSENT_MAX_AGE_DAYS + 1) * DAY);
  assert.equal(parseConsent(old, NOW), null);
  const fresh = serializeConsent(true, NOW - (CONSENT_MAX_AGE_DAYS - 1) * DAY);
  assert.equal(parseConsent(fresh, NOW)?.analytics, true);
});

test("parseConsent: gelecekteki zaman damgası geçersizdir", () => {
  assert.equal(parseConsent(serializeConsent(true, NOW + 30 * DAY), NOW), null);
});

test("readCookieValue: doğru çerezi bulur, benzer adlıyı karıştırmaz", () => {
  const header = "a=1; profect_consent_x=zzz; profect_consent=abc%20d; b=2";
  assert.equal(readCookieValue(header, "profect_consent"), "abc%20d");
  assert.equal(readCookieValue(header, "yok"), null);
});

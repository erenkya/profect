import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePassword, passwordProblem } from "./password-strength.ts";

test("kısa, tek türlü ve yaygın şifreler reddedilir", () => {
  assert.ok(passwordProblem("Ab1"));
  assert.ok(passwordProblem("alllowercase99"));
  assert.ok(passwordProblem("ALLUPPERCASE99"));
  assert.ok(passwordProblem("NoDigitsHereAtAll"));
  assert.ok(passwordProblem("Password123"));
  assert.ok(passwordProblem("P@ssw0rd"));
  assert.ok(passwordProblem("Galatasaray1905"));
});

test("tekrar ve ardışık karakterler puanı düşürür", () => {
  assert.ok(passwordProblem("Aaaaaaaaaa11"));
  assert.ok(passwordProblem("Abcdefg12345"));
  assert.ok(evaluatePassword("Aaaaaaaaaa11").score <= 1);
});

test("kişisel bilgi içeren şifre reddedilir", () => {
  assert.ok(passwordProblem("Eren-Kaya-2026x", ["Eren Kaya", "eren@ornek.com"]));
  assert.equal(passwordProblem("Mavi-Tren-2026x", ["Eren Kaya", "eren@ornek.com"]), null);
});

test("güçlü şifreler kabul edilir ve puan uzunlukla artar", () => {
  assert.equal(passwordProblem("Xk7mQ2pLw9zR"), null);
  const mid = evaluatePassword("Xk7mQ2pLw9");
  const strong = evaluatePassword("Xk7mQ2pLw9z!Rv4#");
  assert.ok(strong.score > mid.score);
  assert.equal(strong.score, 4);
  assert.equal(evaluatePassword("").score, 0);
});

test("72 bayttan uzun şifre reddedilir", () => {
  assert.ok(passwordProblem("Aa1" + "x".repeat(70)));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { loginOutcome } from "./login-rules.ts";

const base = { exists: true, active: true, verified: true, passwordMatches: true };

test("loginOutcome: doğrulanmış aktif hesap doğru şifreyle ok", () => {
  assert.equal(loginOutcome(base), "ok");
});

test("loginOutcome: hesap yoksa ya da şifre yanlışsa invalid", () => {
  assert.equal(loginOutcome({ ...base, exists: false }), "invalid");
  assert.equal(loginOutcome({ ...base, passwordMatches: false }), "invalid");
});

test("loginOutcome: doğrulanmamış aktif hesapta şifre kanıt sayılmaz (eşleşse de eşleşmese de needs_verification)", () => {
  assert.equal(loginOutcome({ ...base, verified: false, passwordMatches: true }), "needs_verification");
  assert.equal(loginOutcome({ ...base, verified: false, passwordMatches: false }), "needs_verification");
});

test("loginOutcome: devre dışı hesap yalnızca doğru şifreyle inactive döner (aksi halde invalid)", () => {
  assert.equal(loginOutcome({ ...base, active: false }), "inactive");
  assert.equal(loginOutcome({ ...base, active: false, passwordMatches: false }), "invalid");
  assert.equal(loginOutcome({ ...base, active: false, verified: false }), "inactive");
  assert.equal(loginOutcome({ ...base, active: false, verified: false, passwordMatches: false }), "invalid");
});

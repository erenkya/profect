import { test } from "node:test";
import assert from "node:assert/strict";
import { randomCourseCode, slugify, uniqueSlug } from "./format.ts";

test("slugify: Türkçe karakterler ASCII'ye çevrilir", () => {
  assert.equal(slugify("Web Tasarımı: Çok Şirin Üçgen!"), "web-tasarimi-cok-sirin-ucgen");
});

test("uniqueSlug: boşsa olduğu gibi, doluysa -2, -3… ekler", () => {
  assert.equal(uniqueSlug("web", []), "web");
  assert.equal(uniqueSlug("web", ["web"]), "web-2");
  assert.equal(uniqueSlug("web", ["web", "web-2"]), "web-3");
  assert.equal(uniqueSlug("", []), "kurs");
});

test("uniqueSlug: sonek eklense de 100 karakteri aşmaz", () => {
  const base = "a".repeat(100);
  assert.ok(uniqueSlug(base, [base]).length <= 100);
});

test("randomCourseCode: PRF- önekli, 30 karakter sınırında ve her çağrıda farklı", () => {
  const codes = new Set(Array.from({ length: 50 }, randomCourseCode));
  assert.equal(codes.size, 50);
  for (const c of codes) assert.match(c, /^PRF-[A-Z2-9]{6}$/);
});

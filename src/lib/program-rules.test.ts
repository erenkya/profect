import { test } from "node:test";
import assert from "node:assert/strict";
import {
  courseProblems,
  generateProgramCertificateCode,
  isProgramComplete,
  priceProblem,
  type CourseEligibility,
} from "./program-rules.ts";

const course = (over: Partial<CourseEligibility> = {}): CourseEligibility => ({
  id: 1,
  title: "Kurs A",
  price: 1000,
  is_published: true,
  has_final_quiz: true,
  ...over,
});

test("isProgramComplete: tüm kurslar sertifikalıysa true", () => {
  assert.equal(isProgramComplete([1, 2], new Set([1, 2, 3])), true);
  assert.equal(isProgramComplete([1, 2], new Set([1])), false);
});

test("isProgramComplete: boş liste her zaman false", () => {
  assert.equal(isProgramComplete([], new Set([1, 2])), false);
  assert.equal(isProgramComplete([], new Set()), false);
});

test("generateProgramCertificateCode: PRP-yıl-6 hane", () => {
  assert.equal(generateProgramCertificateCode(2026, () => 0.5), "PRP-2026-500000");
  assert.equal(generateProgramCertificateCode(2026, () => 0), "PRP-2026-000000");
  assert.match(generateProgramCertificateCode(), /^PRP-\d{4}-\d{6}$/);
});

test("courseProblems: yayında olmayan kurs adıyla bildirilir", () => {
  const p = courseProblems([course(), course({ id: 2, title: "Gizli Kurs", is_published: false })]);
  assert.equal(p.length, 1);
  assert.ok(p[0].includes("Gizli Kurs"));
});

test("courseProblems: final sınavı olmayan kurs adıyla bildirilir", () => {
  const p = courseProblems([course({ id: 2, title: "Sınavsız Kurs", has_final_quiz: false })]);
  assert.equal(p.length, 1);
  assert.ok(p[0].includes("Sınavsız Kurs"));
});

test("courseProblems: boş liste", () => {
  assert.deepEqual(courseProblems([]), ["Programda en az bir kurs olmalı."]);
});

test("courseProblems: hepsi uygunsa boş", () => {
  assert.deepEqual(courseProblems([course(), course({ id: 2, title: "B" })]), []);
});

test("priceProblem: B > S mesaj döner; B ≤ S null", () => {
  const cs = [course({ id: 1, price: 2000 }), course({ id: 2, price: 3000 })];
  const msg = priceProblem(7000, cs);
  assert.equal(typeof msg, "string");
  assert.ok(msg!.includes("7000") && msg!.includes("5000"));
  assert.equal(priceProblem(5000, cs), null);
  assert.equal(priceProblem(4000, cs), null);
});

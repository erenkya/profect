import { test } from "node:test";
import assert from "node:assert/strict";
import { priceProgram, priceProgramsInOrder, type ProgramCourseInput } from "./program-pricing.ts";

const mk = (prices: number[], startId = 1): ProgramCourseInput[] =>
  prices.map((price, i) => ({ id: startId + i, price }));

test("priceProgram: kullanıcının örneği (B=8000, 10×1000, 8 edinilmiş)", () => {
  const courses = mk(Array(10).fill(1000));
  const q = priceProgram(8000, courses, new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  assert.equal(q.listTotal, 10000);
  assert.equal(q.programPrice, 8000);
  assert.equal(q.effectivePrice, 8000);
  assert.equal(q.ratio, 0.8);
  assert.equal(q.credit, 6400);
  assert.equal(q.payable, 1600);
  assert.equal(q.ownedCount, 8);
  assert.equal(q.lines.length, 10);
  const unowned = q.lines.filter((l) => !l.owned);
  assert.equal(unowned.length, 2);
  for (const l of unowned) {
    assert.equal(l.listPrice, 1000);
    assert.equal(l.price, 800);
  }
});

test("priceProgram: hiçbiri edinilmemiş → kredi 0, ödenecek B", () => {
  const q = priceProgram(8000, mk(Array(10).fill(1000)), new Set());
  assert.equal(q.credit, 0);
  assert.equal(q.payable, 8000);
  assert.equal(q.ownedCount, 0);
});

test("priceProgram: hepsi edinilmiş → ödenecek 0, kredi B", () => {
  const q = priceProgram(8000, mk(Array(10).fill(1000)), new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  assert.equal(q.payable, 0);
  assert.equal(q.credit, 8000);
  assert.equal(q.ownedCount, 10);
});

test("priceProgram: farklı fiyatlar (1000/2000/3000, B=4800, 2000'lik edinilmiş)", () => {
  const q = priceProgram(4800, mk([1000, 2000, 3000]), new Set([2]));
  assert.equal(q.ratio, 0.8);
  assert.equal(q.credit, 1600);
  assert.equal(q.payable, 3200);
});

test("priceProgram: B > S ise geçerli fiyat S'e indirilir", () => {
  const courses = mk([2000, 3000]);
  const none = priceProgram(7000, courses, new Set());
  assert.equal(none.effectivePrice, 5000);
  assert.equal(none.programPrice, 7000);
  assert.equal(none.payable, 5000);
  const some = priceProgram(7000, courses, new Set([1]));
  assert.equal(some.payable, 3000);
});

test("priceProgram: S=0 (ücretsiz kurslar) → ratio 1, effective 0, ödenecek 0", () => {
  const q = priceProgram(500, mk([0, 0]), new Set());
  assert.equal(q.ratio, 1);
  assert.equal(q.effectivePrice, 0);
  assert.equal(q.payable, 0);
});

test("priceProgram: kuruş yuvarlama (100/100/100, B=100, biri edinilmiş)", () => {
  const q = priceProgram(100, mk([100, 100, 100]), new Set([1]));
  assert.equal(q.credit, 33.33);
  assert.equal(q.payable, 66.67);
});

test("priceProgram: programda olmayan edinilmiş kurs sayılmaz", () => {
  const q = priceProgram(1000, mk([1000, 1000]), new Set([99]));
  assert.equal(q.ownedCount, 0);
  assert.equal(q.credit, 0);
});

test("priceProgram değişmezleri: 0 ≤ ödenecek ≤ effective ve ≤ edinilmemiş liste toplamı", () => {
  const cases: { b: number; prices: number[]; owned: number[] }[] = [
    { b: 8000, prices: Array(10).fill(1000), owned: [1, 2, 3, 4, 5, 6, 7, 8] },
    { b: 4800, prices: [1000, 2000, 3000], owned: [2] },
    { b: 7000, prices: [2000, 3000], owned: [] },
    { b: 7000, prices: [2000, 3000], owned: [1] },
    { b: 100, prices: [100, 100, 100], owned: [1] },
    { b: 100, prices: [100, 100, 100], owned: [1, 2] },
    { b: 500, prices: [0, 0], owned: [] },
    { b: 500, prices: [0, 300], owned: [1] },
    { b: 0, prices: [100, 200], owned: [] },
    { b: 299.99, prices: [99.99, 150.5, 49.5], owned: [3] },
    { b: 1, prices: [0.01, 0.02, 0.03], owned: [1, 3] },
    { b: 1234.56, prices: [333.33, 333.33, 333.34, 500], owned: [1, 2, 3] },
    { b: 999, prices: [250, 250, 250, 250], owned: [1, 2, 3, 4] },
    { b: 10, prices: [7, 7, 7], owned: [2, 3] },
  ];
  assert.ok(cases.length >= 12);
  for (const c of cases) {
    const courses = mk(c.prices);
    const owned = new Set(c.owned);
    const q = priceProgram(c.b, courses, owned);
    const unownedList = Math.round(courses.filter((x) => !owned.has(x.id)).reduce((s, x) => s + x.price, 0) * 100) / 100;
    assert.ok(q.payable >= 0, `payable >= 0 (${JSON.stringify(c)})`);
    assert.ok(q.payable <= q.effectivePrice, `payable <= effective (${JSON.stringify(c)})`);
    assert.ok(q.payable <= unownedList, `payable <= unowned list (${JSON.stringify(c)})`);
  }
});

test("priceProgramsInOrder: önceki programın kursları sonrakinde edinilmiş sayılır", () => {
  const p1 = { price: 1600, courses: [{ id: 1, price: 1000 }, { id: 2, price: 1000 }] };
  const p2 = { price: 1600, courses: [{ id: 2, price: 1000 }, { id: 3, price: 1000 }] };
  const [q1, q2] = priceProgramsInOrder([p1, p2], new Set());
  assert.equal(q1.payable, 1600);
  assert.equal(q2.credit, 800);
  assert.equal(q2.payable, 800);
  assert.equal(q2.ownedCount, 1);
});

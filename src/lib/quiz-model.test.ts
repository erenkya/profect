import { test } from "node:test";
import assert from "node:assert/strict";
import { applySavedOrder, isAnswered, orderForStudent, snapshotOrder, type PublicQuestion, type QuizItem, type ScenarioRef } from "./quiz-model.ts";

const single = (id: number, scenario: ScenarioRef | null = null): PublicQuestion => ({ id, kind: "single", text: `S${id}`, scenario, options: [{ id: 1, text: "a" }, { id: 2, text: "b" }] });
const multiple: PublicQuestion = { id: 10, kind: "multiple", text: "M", scenario: null, options: [{ id: 5, text: "a" }, { id: 6, text: "b" }, { id: 7, text: "c" }], correctCount: 2 };
const categorize: PublicQuestion = { id: 20, kind: "categorize", text: "C", scenario: null, cards: [{ id: 1, text: "x" }, { id: 2, text: "y" }], categories: [{ id: 10, name: "A" }, { id: 11, name: "B" }] };
const reverse = <T,>(a: T[]) => [...a].reverse();

test("isAnswered: single sayı varsa true, undefined false", () => {
  assert.equal(isAnswered(single(1), 2), true);
  assert.equal(isAnswered(single(1), undefined), false);
});

test("isAnswered: multiple yalnızca seçim sayısı correctCount'a eşitse true", () => {
  assert.equal(isAnswered(multiple, [5]), false);
  assert.equal(isAnswered(multiple, [5, 6]), true);
  assert.equal(isAnswered(multiple, undefined), false);
});

test("isAnswered: categorize tüm kartlar yerleşince true", () => {
  assert.equal(isAnswered(categorize, { "1": 10 }), false);
  assert.equal(isAnswered(categorize, { "1": 10, "2": 11 }), true);
});

test("orderForStudent: senaryo alt soruları bitişik ve sıralı kalır", () => {
  const s: ScenarioRef = { id: 99, text: "Senaryo", prompt: null };
  const [a, b, c] = [single(3, s), single(4, s), single(5, s)];
  const items: QuizItem[] = [{ kind: "question", question: single(1) }, { kind: "scenario", scenario: s, questions: [a, b, c] }, { kind: "question", question: single(2) }];
  const out = orderForStudent(items, reverse);
  assert.deepEqual(out.map((q) => q.id), [2, 3, 4, 5, 1]);
  for (const q of out.slice(1, 4)) assert.equal(q.scenario, s);
});

test("applySavedOrder: kaydedilen soru ve şık/kart sırası geri uygulanır", () => {
  const qs = [single(1), multiple, categorize];
  const saved = [
    { id: 20, choices: [2, 1] },
    { id: 1, choices: [2, 1] },
    { id: 10, choices: [7, 5, 6] },
  ];
  const out = applySavedOrder(qs, saved);
  assert.ok(out);
  assert.deepEqual(out.map((q) => q.id), [20, 1, 10]);
  assert.deepEqual(out[0].kind === "categorize" && out[0].cards.map((c) => c.id), [2, 1]);
  assert.deepEqual(out[2].kind === "multiple" && out[2].options.map((o) => o.id), [7, 5, 6]);
});

test("applySavedOrder: soru ya da şık kümesi değiştiyse null (yeniden karıştırılır)", () => {
  const qs = [single(1), multiple];
  assert.equal(applySavedOrder(qs, [{ id: 1, choices: [1, 2] }]), null); // eksik soru
  assert.equal(applySavedOrder(qs, [{ id: 1, choices: [1, 2] }, { id: 10, choices: [5, 6] }]), null); // eksik şık
  assert.equal(applySavedOrder(qs, [{ id: 1, choices: [1, 2] }, { id: 99, choices: [5, 6, 7] }]), null); // başka soru
});

test("snapshotOrder: applySavedOrder ile gidiş-dönüş aynı sırayı verir", () => {
  const qs = [categorize, single(1), multiple];
  assert.deepEqual(applySavedOrder([single(1), multiple, categorize], snapshotOrder(qs)), qs);
});

test("orderForStudent: alt sorusuz senaryo atlanır", () => {
  const s: ScenarioRef = { id: 99, text: "Senaryo", prompt: "?" };
  const out = orderForStudent([{ kind: "scenario", scenario: s, questions: [] }, { kind: "question", question: single(1) }], (a) => a);
  assert.deepEqual(out.map((q) => q.id), [1]);
});

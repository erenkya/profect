import { test } from "node:test";
import assert from "node:assert/strict";
import { isAnswered, orderForStudent, type PublicQuestion, type QuizItem, type ScenarioRef } from "./quiz-model.ts";

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

test("orderForStudent: alt sorusuz senaryo atlanır", () => {
  const s: ScenarioRef = { id: 99, text: "Senaryo", prompt: "?" };
  const out = orderForStudent([{ kind: "scenario", scenario: s, questions: [] }, { kind: "question", question: single(1) }], (a) => a);
  assert.deepEqual(out.map((q) => q.id), [1]);
});

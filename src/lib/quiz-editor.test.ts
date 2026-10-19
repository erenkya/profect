import { test } from "node:test";
import assert from "node:assert/strict";
import { changeKind, type ChoiceQ } from "./quiz-editor.ts";

const q: ChoiceQ = {
  kind: "single",
  question_text: "Soru",
  explanation: "neden",
  options: [{ option_text: "A", is_correct: false }, { option_text: "B", is_correct: true }, { option_text: "", is_correct: false }],
};

test("changeKind: şıklı → sürükle-bırak şık metinlerini kategorisiz kart yapar", () => {
  const c = changeKind(q, "categorize");
  assert.equal(c.kind, "categorize");
  assert.equal(c.question_text, "Soru");
  assert.equal(c.explanation, "neden");
  assert.deepEqual(c.kind === "categorize" && c.cards, [{ card_text: "A", category_index: -1 }, { card_text: "B", category_index: -1 }]);
});

test("changeKind: sürükle-bırak → şıklı ve geri dönüşte metinler kaybolmaz", () => {
  const back = changeKind(changeKind(q, "categorize"), "single");
  assert.equal(back.kind, "single");
  assert.deepEqual(back.kind === "single" && back.options.map((o) => o.option_text), ["A", "B"]);
  // tek cevaplıda tam bir doğru şık olur
  assert.equal(back.kind === "single" && back.options.filter((o) => o.is_correct).length, 1);
});

test("changeKind: boş şıklar en az 2 karta tamamlanır", () => {
  const c = changeKind({ ...q, options: [{ option_text: "", is_correct: true }, { option_text: "", is_correct: false }] }, "categorize");
  assert.equal(c.kind === "categorize" && c.cards.length, 2);
});

test("changeKind: tek → çok cevaplı doğruları korur, çok → tek yalnız ilk doğruyu", () => {
  const m = changeKind({ ...q, options: q.options.map((o) => ({ ...o, is_correct: true })) }, "multiple");
  assert.equal(m.kind === "multiple" && m.options.filter((o) => o.is_correct).length, 3);
  const s = changeKind(m, "single");
  assert.deepEqual(s.kind === "single" && s.options.map((o) => o.is_correct), [true, false, false]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { changeKind, configFromForm, poolFromEditor, toEditor, type ChoiceQ } from "./quiz-editor.ts";

const q: ChoiceQ = {
  kind: "single",
  question_text: "Soru",
  explanation: "neden",
  is_required: false,
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

test("changeKind: kesin işareti her tip geçişinde korunur", () => {
  const req = { ...q, is_required: true };
  assert.equal(changeKind(req, "multiple").is_required, true);
  assert.equal(changeKind(req, "categorize").is_required, true);
  assert.equal(changeKind(changeKind(req, "categorize"), "single").is_required, true);
});

test("toEditor: kesin işareti editör durumuna taşınır", () => {
  const e = toEditor({ kind: "single", question_text: "x", is_required: true, options: [{ option_text: "a", is_correct: true }, { option_text: "b", is_correct: false }] });
  assert.equal(e.kind !== "scenario" && e.is_required, true);
});

test("poolFromEditor: senaryo alt soruları kendi tipiyle düzleşir, senaryonun kendisi yok", () => {
  const items = [
    { ...q, is_required: true },
    { kind: "scenario" as const, scenario_text: "S", scenario_prompt: "", questions: [{ ...q, kind: "multiple" as const }, { ...q, is_required: true }] },
  ];
  assert.deepEqual(poolFromEditor(items), [{ kind: "single", required: true }, { kind: "multiple", required: false }, { kind: "single", required: true }]);
});

test("configFromForm: boş alanlar kota yok, sayı boşsa drawCount null", () => {
  assert.deepEqual(configFromForm("", { single: "", multiple: "3", categorize: "" }), { drawCount: null, byType: { multiple: 3 } });
});

test("configFromForm: 0, yazı, ondalık ve negatif değerler atılır; boşluklar kırpılır", () => {
  assert.deepEqual(configFromForm("20", { single: "0", multiple: "abc", categorize: " 5 " }), { drawCount: 20, byType: { categorize: 5 } });
  assert.deepEqual(configFromForm("0", { single: "-2", multiple: "1.5", categorize: "" }), { drawCount: null, byType: {} });
});

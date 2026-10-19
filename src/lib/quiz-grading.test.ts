import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeQuestion, parseStoredAnswers, scoreAttempt, type GradingQuestion } from "./quiz-grading.ts";

const single: GradingQuestion = { id: 1, kind: "single", explanation: "neden", optionIds: [1, 2, 3], correctOptionIds: [2] };
const multiple: GradingQuestion = { id: 2, kind: "multiple", explanation: null, optionIds: [1, 2, 3, 4], correctOptionIds: [2, 3] };
// kart 1,2 → kategori 10; kart 3,4 → kategori 11
const categorize: GradingQuestion = { id: 3, kind: "categorize", explanation: "açıklama", categoryIds: [10, 11], cardCategory: { "1": 10, "2": 10, "3": 11, "4": 11 } };

test("gradeQuestion: single doğru 1, yanlış 0, null 0", () => {
  assert.equal(gradeQuestion(single, 2).points, 1);
  assert.equal(gradeQuestion(single, 2).isCorrect, true);
  assert.equal(gradeQuestion(single, 3).points, 0);
  assert.equal(gradeQuestion(single, null).points, 0);
  assert.equal(gradeQuestion(single, null).answer, null);
});

test("gradeQuestion: multiple küme eşitse 1, sıra önemsiz", () => {
  const r = gradeQuestion(multiple, [3, 2]);
  assert.equal(r.points, 1);
  assert.equal(r.isCorrect, true);
});

test("gradeQuestion: multiple yalnızca seçilen şıklar için optionResults döner", () => {
  // doğru [2,3]; öğrenci 2 ve 4'ü seçti → 3 (seçilmeyen doğru) sonuçta geçmez
  assert.deepEqual(gradeQuestion(multiple, [2, 4]).optionResults, { "2": true, "4": false });
  assert.equal(gradeQuestion(single, 2).optionResults, undefined);
});

test("gradeQuestion: multiple'da doğru sayısından fazla seçim cevap anahtarını sızdırmaz", () => {
  // Arayüz en fazla correctCount seçtirir; elle tüm şıkları gönderen 0 alır ve şık başına sonuç görmez.
  const r = gradeQuestion(multiple, [1, 2, 3, 4]);
  assert.equal(r.points, 0);
  assert.equal(r.optionResults, undefined);
});

test("gradeQuestion: multiple eksik seçim 0", () => {
  assert.equal(gradeQuestion(multiple, [2]).points, 0);
});

test("gradeQuestion: multiple fazla seçim 0", () => {
  assert.equal(gradeQuestion(multiple, [2, 3, 4]).points, 0);
});

test("gradeQuestion: categorize kart başına kısmi puan", () => {
  const r = gradeQuestion(categorize, { "1": 10, "2": 10, "3": 11, "4": 10 });
  assert.equal(r.points, 0.75);
  assert.equal(r.isCorrect, false);
  assert.deepEqual(r.cardResults, { "1": true, "2": true, "3": true, "4": false });
});

test("gradeQuestion: yarım categorize cevabı kısmi puan alır", () => {
  const r = gradeQuestion(categorize, { "1": 10, "3": 11 });
  assert.equal(r.points, 0.5);
  assert.equal(r.cardResults?.["2"], false);
  assert.equal(r.cardResults?.["4"], false);
});

test("gradeQuestion: geçersiz cevap biçimleri 0 puan", () => {
  // single: başka sorunun şık id'si, dizi, metin
  for (const raw of [99, [2], "2", { "2": 1 }, undefined]) assert.equal(gradeQuestion(single, raw).points, 0, JSON.stringify(raw));
  // multiple: tekrarlanan id küme olarak sayılır
  assert.equal(gradeQuestion(multiple, [2, 2, 3]).points, 1);
  // multiple: sayı, başka sorunun şıkkı
  assert.equal(gradeQuestion(multiple, 5).points, 0);
  assert.equal(gradeQuestion(multiple, [2, 3, 99]).points, 0);
  // categorize: dizi, var olmayan kategori, bilinmeyen kart
  assert.equal(gradeQuestion(categorize, [10, 11]).points, 0);
  const r = gradeQuestion(categorize, { "1": 999, "2": 10, "77": 10 });
  assert.equal(r.cardResults?.["1"], false);
  assert.equal(r.points, 0.25);
  assert.equal("77" in (r.cardResults ?? {}), false);
});

test("gradeQuestion: categorize kaydedilen cevaba miras alınan anahtarlar girmez", () => {
  const r = gradeQuestion(categorize, { "1": 10, constructor: 10, toString: 11 });
  assert.deepEqual(r.answer, { "1": 10 });
});

test("gradeQuestion: açıklama yalnızca points < 1 iken döner", () => {
  assert.equal(gradeQuestion(single, 2).explanation, undefined);
  assert.equal(gradeQuestion(single, 1).explanation, "neden");
  assert.equal(gradeQuestion(multiple, [2]).explanation, undefined); // açıklaması yok
});

test("gradeQuestion: cardResults doğru kategoriyi sızdırmaz", () => {
  // Öğrenci tüm kartları 10'a koydu; 11 (3 ve 4'ün doğru kategorisi) sonuçta geçmemeli.
  const r = gradeQuestion(categorize, { "1": 10, "2": 10, "3": 10, "4": 10 });
  assert.equal(JSON.stringify(r).includes("11"), false);
});

test("scoreAttempt: kısmi puanlar toplanır, score yuvarlanır, correctCount yalnız tam doğrular", () => {
  const s = scoreAttempt([1, 0.75, 0].map((points) => ({ points, isCorrect: points === 1, answer: null })));
  assert.equal(s.points, 1.75);
  assert.equal(s.score, 58);
  assert.equal(s.correctCount, 1);
});

test("parseStoredAnswers: eski sayı biçimi, JSON metni ve bozuk metin", () => {
  assert.deepEqual(parseStoredAnswers({ "5": 3, "6": null }), { "5": 3, "6": null });
  assert.deepEqual(parseStoredAnswers('{"5":[1,2],"6":{"1":10}}'), { "5": [1, 2], "6": { "1": 10 } });
  assert.deepEqual(parseStoredAnswers("{bozuk"), {});
  assert.deepEqual(parseStoredAnswers(null), {});
  assert.deepEqual(parseStoredAnswers("[1,2]"), {});
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { lessonSchema, quizSchema, videoUploadSchema } from "./admin-schemas.ts";

const KEY = "kurslar/web-tasarim/34-giris/a1b2c3d4-html-temelleri.mp4";
const lesson = (over: Record<string, unknown>) => lessonSchema.safeParse({ title: "Ders", lesson_type: "video", content: KEY, duration_minutes: 10, ...over });

test("lessonSchema: geçerli R2 anahtarlı video dersi kabul edilir", () => {
  assert.equal(lesson({}).success, true);
});

test("lessonSchema: video dersinde YouTube ID'si, '../' içeren veya rastgele içerik reddedilir", () => {
  for (const content of ["dQw4w9WgXcQ", "vimeo:123", "kurslar/../x.mp4", "https://youtu.be/dQw4w9WgXcQ", "kurslar/a/1-b/zzzzzzzz-c.mp4"]) {
    assert.equal(lesson({ content }).success, false, content);
  }
});

test("lessonSchema: metin dersinde içerik serbesttir", () => {
  assert.equal(lesson({ lesson_type: "text", content: "# Merhaba\n\nmetin" }).success, true);
  assert.equal(lesson({ lesson_type: "text", content: "" }).success, false);
});

test("lessonSchema: süre zorunludur (boş, null, 0 ve negatif reddedilir)", () => {
  for (const duration_minutes of [undefined, null, "", 0, -5]) {
    assert.equal(lesson({ duration_minutes }).success, false, String(duration_minutes));
  }
  assert.equal(lesson({ duration_minutes: "15" }).success, true);
});

test("quizSchema: süre zorunludur", () => {
  const quiz = (over: Record<string, unknown>) => quizSchema.safeParse({ title: "Sınav", questions: [], duration_minutes: 20, ...over });
  assert.equal(quiz({}).success, true);
  for (const duration_minutes of [undefined, null, "", 0]) assert.equal(quiz({ duration_minutes }).success, false, String(duration_minutes));
});

// — Soru tipleri —
const parseQ = (q: Record<string, unknown>) => quizSchema.safeParse({ title: "Sınav", duration_minutes: 20, questions: [q] });
const opts = (...correct: boolean[]) => correct.map((is_correct, i) => ({ option_text: `Şık ${i + 1}`, is_correct }));
const cat = (categories: string[], cardIdx: number[]) => ({ kind: "categorize", question_text: "Ayır", categories, cards: cardIdx.map((category_index, i) => ({ card_text: `Kart ${i}`, category_index })) });

test("quizSchema: kind'sız eski girdi single olarak kabul edilir", () => {
  const r = parseQ({ question_text: "2+2?", options: opts(true, false) });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.questions[0].kind, "single");
});

test("quizSchema: single'da 2 doğru reddedilir; multiple'da 2 doğru kabul, 0 doğru reddedilir", () => {
  assert.equal(parseQ({ kind: "single", question_text: "x", options: opts(true, true) }).success, false);
  assert.equal(parseQ({ kind: "multiple", question_text: "x", options: opts(true, true, false) }).success, true);
  assert.equal(parseQ({ kind: "multiple", question_text: "x", options: opts(false, false) }).success, false);
});

test("quizSchema: categorize — boş kategori, aralık dışı category_index ve tek kategori reddedilir", () => {
  assert.equal(parseQ(cat(["A", "B"], [0, 1, 1])).success, true);
  assert.equal(parseQ(cat(["A", "B", "C"], [0, 1, 1])).success, false); // C boş
  assert.equal(parseQ(cat(["A", "B"], [0, 1, 2])).success, false);
  assert.equal(parseQ(cat(["A"], [0, 0])).success, false);
});

test("quizSchema: scenario — alt sorusuz reddedilir; içinde categorize reddedilir; single+multiple alt sorularla kabul", () => {
  const sc = (questions: unknown[]) => parseQ({ kind: "scenario", scenario_text: "Bir şirkette…", scenario_prompt: "Ne yaparsınız?", questions });
  assert.equal(sc([]).success, false);
  assert.equal(sc([cat(["A", "B"], [0, 1])]).success, false);
  const ok = sc([{ question_text: "a", options: opts(true, false) }, { kind: "multiple", question_text: "b", options: opts(true, true, false) }]);
  assert.equal(ok.success, true);
});

test("videoUploadSchema: geçerli istek kabul edilir", () => {
  assert.equal(videoUploadSchema.safeParse({ module_id: 3, lesson_title: "Giriş", content_type: "video/mp4", size: 262_144_000 }).success, true);
});

test("videoUploadSchema: 2 GB üstü, boş dosya, mp4 dışı tür ve başlıksız istek reddedilir", () => {
  const ok = { module_id: 3, lesson_title: "Giriş", content_type: "video/mp4", size: 1000 };
  assert.equal(videoUploadSchema.safeParse({ ...ok, size: 2_147_483_649 }).success, false);
  assert.equal(videoUploadSchema.safeParse({ ...ok, size: 0 }).success, false);
  assert.equal(videoUploadSchema.safeParse({ ...ok, content_type: "video/webm" }).success, false);
  assert.equal(videoUploadSchema.safeParse({ ...ok, lesson_title: "  " }).success, false);
  assert.equal(videoUploadSchema.safeParse({ ...ok, module_id: 0 }).success, false);
});

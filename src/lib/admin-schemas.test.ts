import { test } from "node:test";
import assert from "node:assert/strict";
import { createPostSchema, lessonSchema, postImageUploadSchema, quizSchema, updatePostSchema, videoUploadSchema } from "./admin-schemas.ts";

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

// — Sınav modu ve havuz ayarları —
const sq = (over: Record<string, unknown> = {}) => ({ kind: "single", question_text: "Soru", options: [{ option_text: "a", is_correct: true }, { option_text: "b", is_correct: false }], ...over });
const qz = (over: Record<string, unknown> = {}) => quizSchema.safeParse({ title: "Sınav", duration_minutes: 20, questions: [sq(), sq(), sq()], ...over });

test("quizSchema: mode verilmezse fixed, draw_count null, draw_by_type boş", () => {
  const r = qz();
  assert.ok(r.success);
  if (r.success) assert.deepEqual([r.data.mode, r.data.draw_count, r.data.draw_by_type], ["fixed", null, {}]);
});

test("quizSchema: havuz modunda geçerli ayar kabul edilir", () => {
  assert.equal(qz({ mode: "pool", draw_count: 2, questions: [sq({ is_required: true }), sq(), sq()] }).success, true);
});

test("quizSchema: havuzdan fazla soru istenirse reddedilir", () => {
  const r = qz({ mode: "pool", draw_count: 5 });
  assert.equal(r.success, false);
  if (!r.success) assert.ok(r.error.issues.some((i) => i.message.includes("havuzda 3 soru var")));
});

test("quizSchema: havuzdan sabit moda geçerken eski draw_count, kota ve kesin işaretleri hata vermez", () => {
  assert.equal(qz({ mode: "fixed", draw_count: 99, draw_by_type: { single: 50 }, questions: [sq({ is_required: true }), sq()] }).success, true);
});

test("quizSchema: kota 0 ya da tamsayı olmayan değer her modda reddedilir", () => {
  for (const mode of ["fixed", "pool"]) {
    assert.equal(qz({ mode, draw_by_type: { single: 0 } }).success, false, `${mode} 0`);
    assert.equal(qz({ mode, draw_by_type: { single: 1.5 } }).success, false, `${mode} 1.5`);
  }
});

test("quizSchema: is_required verilmeyen soru false olur", () => {
  const r = qz();
  assert.ok(r.success);
  if (r.success) assert.equal(r.data.questions[0].kind === "single" && r.data.questions[0].is_required, false);
});

test("quizSchema: senaryo alt sorusunun kesin işareti havuz doğrulamasına girer", () => {
  const scenario = { kind: "scenario", scenario_text: "Senaryo", questions: [sq({ is_required: true })] };
  assert.equal(qz({ mode: "pool", draw_count: 1, questions: [scenario] }).success, true);
  assert.equal(qz({ mode: "pool", draw_count: 1, draw_by_type: { multiple: 1 }, questions: [scenario] }).success, false);
});

test("quizSchema: sabit modda gizli alanlardaki büyük eski değerler kaydı engellemez", () => {
  assert.equal(qz({ mode: "fixed", draw_count: 250, draw_by_type: { single: 250 } }).success, true);
});

test("quizSchema: havuz modunda havuzdan büyük sayı anlaşılır bir hatayla reddedilir (genel sınır hatasıyla değil)", () => {
  const r = qz({ mode: "pool", draw_count: 250, draw_by_type: { single: 250 } });
  assert.equal(r.success, false);
  if (!r.success) assert.ok(r.error.issues.some((i) => i.message.includes("havuzda 3 soru var")), r.error.issues.map((i) => i.message).join("|"));
});

const POST_KEY = "gorseller/a1b2c3d4e5f60718.png";
const post = (over: Record<string, unknown> = {}) => ({ type: "blog", title: "Merhaba", content: "# x", status: "draft", ...over });

test("createPostSchema: yalnızca tür, başlık, içerik ve durum zorunlu; geri kalanı isteğe bağlı", () => {
  assert.ok(createPostSchema.safeParse(post()).success);
  assert.ok(createPostSchema.safeParse(post({ slug: "merhaba-dunya", cover_key: POST_KEY, author: "Ayşe", excerpt: "Özet", published_at: "2026-10-05T09:30" })).success);
  assert.ok(createPostSchema.safeParse(post({ published_at: "2026-10-05 09:30:00", cover_key: null })).success);
});

test("createPostSchema: geçersiz tür, adres, kapak ve tarih reddedilir", () => {
  for (const bad of [{ type: "duyuru" }, { title: "a" }, { slug: "Büyük Harf" }, { slug: "a/b" }, { cover_key: "kapaklar/12-a1b2c3d4.jpg" }, { cover_key: "gorseller/../x.png" }, { published_at: "dün" }, { status: "archived" }, { excerpt: "x".repeat(401) }]) {
    assert.ok(!createPostSchema.safeParse(post(bad)).success, JSON.stringify(bad));
  }
});

test("updatePostSchema: kısmi güncellemeye izin verir ama alan kurallarını korur", () => {
  assert.ok(updatePostSchema.safeParse({}).success);
  assert.ok(updatePostSchema.safeParse({ status: "published" }).success);
  assert.ok(!updatePostSchema.safeParse({ slug: "BÜYÜK" }).success);
});

test("postImageUploadSchema: tür ve 8 MB sınırı", () => {
  assert.ok(postImageUploadSchema.safeParse({ content_type: "image/gif", size: 1000 }).success);
  assert.ok(postImageUploadSchema.safeParse({ content_type: "image/webp", size: 8_388_608 }).success);
  for (const bad of [{ content_type: "image/svg+xml", size: 10 }, { content_type: "image/png", size: 8_388_609 }, { content_type: "image/png", size: 0 }]) {
    assert.ok(!postImageUploadSchema.safeParse(bad).success, JSON.stringify(bad));
  }
});

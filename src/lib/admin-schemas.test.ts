import { test } from "node:test";
import assert from "node:assert/strict";
import { lessonSchema, videoUploadSchema } from "./admin-schemas.ts";

const KEY = "kurslar/web-tasarim/34-giris/a1b2c3d4-html-temelleri.mp4";
const lesson = (over: Record<string, unknown>) => lessonSchema.safeParse({ title: "Ders", lesson_type: "video", content: KEY, ...over });

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

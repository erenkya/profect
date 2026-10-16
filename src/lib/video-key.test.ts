import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, buildVideoKey, isVideoKey, keyInModule, randomId, moduleFolder, MAX_VIDEO_BYTES, VIDEO_CHUNK_BYTES, QUOTA_MULTIPLIER, isQuotaExceeded } from "./video-key.ts";

const KEY = "kurslar/web-tasarim/34-giris/a1b2c3d4-html-temelleri.mp4";

test("slugify Türkçe karakterleri ASCII'ye çevirir", () => {
  assert.equal(slugify("Şık Çğüö!", "x"), "sik-cguo");
  assert.equal(slugify("İstanbul ILIK ışık", "x"), "istanbul-ilik-isik");
});

test("slugify harf/rakam yoksa yedek değeri döner", () => {
  assert.equal(slugify("???", "ders"), "ders");
  assert.equal(slugify("   ", "modul"), "modul");
});

test("slugify en çok 40 karakter ve kenarlarda tire yok", () => {
  const s = slugify("a".repeat(100), "x");
  assert.ok(s.length <= 40);
  assert.equal(slugify("--merhaba--dünya--", "x"), "merhaba-dunya");
  assert.ok(!slugify("ab ".repeat(30), "x").endsWith("-"));
});

test("moduleFolder ve buildVideoKey beklenen düzeni üretir", () => {
  assert.equal(moduleFolder("web-tasarim", 34, "Giriş"), "kurslar/web-tasarim/34-giris/");
  assert.equal(buildVideoKey("web-tasarim", 34, "Giriş", "HTML Temelleri", "a1b2c3d4"), KEY);
});

test("buildVideoKey boş başlıkta bile geçerli anahtar üretir", () => {
  const k = buildVideoKey("web-tasarim", 7, "???", "!!!", "00ff00ff");
  assert.equal(k, "kurslar/web-tasarim/7-modul/00ff00ff-ders.mp4");
  assert.ok(isVideoKey(k));
});

test("isVideoKey yalnızca kurslar/ düzenindeki .mp4 anahtarlarını kabul eder", () => {
  assert.equal(isVideoKey(KEY), true);
  for (const bad of ["kurslar/../x.mp4", "x/y.mp4", "kurslar/a/1-b/zzzzzzzz-c.mp4", "dQw4w9WgXcQ", "kurslar/a/1-b/a1b2c3d4-c.mov", "", "kurslar/a/1-b/a1b2c3d4-c.mp4/../../x"]) {
    assert.equal(isVideoKey(bad), false, bad);
  }
});

test("keyInModule kurs slug'ı ve modül id'sini birlikte doğrular", () => {
  assert.equal(keyInModule(KEY, "web-tasarim", 34), true);
  assert.equal(keyInModule(KEY, "web-tasarim", 3), false);
  assert.equal(keyInModule(KEY, "baska", 34), false);
  assert.equal(keyInModule("kurslar/web-tasarim/34-giris/../../../x.mp4", "web-tasarim", 34), false);
});

test("randomId 8 haneli küçük hex'tir ve her çağrıda farklıdır", () => {
  const a = randomId();
  assert.match(a, /^[a-f0-9]{8}$/);
  assert.notEqual(a, randomId());
});

test("sabitler spec ile aynı", () => {
  assert.equal(MAX_VIDEO_BYTES, 2147483648);
  assert.equal(VIDEO_CHUNK_BYTES, 4194304);
  assert.equal(QUOTA_MULTIPLIER, 5);
});

test("isQuotaExceeded: günlük akış video boyutunun 5 katına ulaşınca true", () => {
  const total = 250_000_000;
  assert.equal(isQuotaExceeded(0, total), false);
  assert.equal(isQuotaExceeded(5 * total - 1, total), false);
  assert.equal(isQuotaExceeded(5 * total, total), true);
  assert.equal(isQuotaExceeded(9 * total, total), true);
});

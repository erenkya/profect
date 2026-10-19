import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_COVER_BYTES, buildCoverKey, coverContentType, coverKeyForCourse, coverKeyFromName, coverUrl, isCoverKey, isCoverType } from "./cover-key.ts";

const KEY = "kapaklar/12-a1b2c3d4.jpg";

test("buildCoverKey türe göre uzantı seçer", () => {
  assert.equal(buildCoverKey(12, "image/jpeg", "a1b2c3d4"), KEY);
  assert.equal(buildCoverKey(3, "image/png", "00ff00ff"), "kapaklar/3-00ff00ff.png");
  assert.equal(buildCoverKey(3, "image/webp", "00ff00ff"), "kapaklar/3-00ff00ff.webp");
});

test("isCoverType yalnızca jpeg/png/webp kabul eder", () => {
  assert.ok(isCoverType("image/jpeg") && isCoverType("image/png") && isCoverType("image/webp"));
  assert.ok(!isCoverType("image/svg+xml") && !isCoverType("image/gif") && !isCoverType("video/mp4"));
});

test("isCoverKey biçimi doğrular, path traversal ve başka klasörleri reddeder", () => {
  assert.ok(isCoverKey(KEY));
  for (const bad of ["", "kapaklar/12-a1b2c3d4.gif", "kapaklar/12-A1B2C3D4.jpg", "kapaklar/../12-a1b2c3d4.jpg", "kurslar/12-a1b2c3d4.jpg", "kapaklar/x-a1b2c3d4.jpg", "kapaklar/12-a1b2c3d4.jpg/extra", " kapaklar/12-a1b2c3d4.jpg"]) {
    assert.ok(!isCoverKey(bad), bad);
  }
});

test("coverKeyForCourse anahtarın kursa ait olduğunu denetler", () => {
  assert.ok(coverKeyForCourse(KEY, 12));
  assert.ok(!coverKeyForCourse(KEY, 1)); // 12 ≠ 1 (önek eşleşmesi değil, tam sayı eşleşmesi)
  assert.ok(!coverKeyForCourse(KEY, 13));
  assert.ok(!coverKeyForCourse("kapaklar/evil.jpg", 12));
});

test("coverContentType uzantıdan türü bulur", () => {
  assert.equal(coverContentType(KEY), "image/jpeg");
  assert.equal(coverContentType("kapaklar/1-a1b2c3d4.png"), "image/png");
  assert.equal(coverContentType("kapaklar/1-a1b2c3d4.webp"), "image/webp");
  assert.equal(coverContentType("nope"), null);
});

test("coverUrl ve coverKeyFromName birbirinin tersidir", () => {
  assert.equal(coverUrl(KEY), "/api/kapak/12-a1b2c3d4.jpg");
  assert.equal(coverUrl(null), null);
  assert.equal(coverUrl("javascript:alert(1)"), null);
  assert.equal(coverKeyFromName("12-a1b2c3d4.jpg"), KEY);
  assert.equal(coverKeyFromName("../x.jpg"), null);
  assert.equal(coverKeyFromName("12-a1b2c3d4.svg"), null);
});

test("MAX_COVER_BYTES 5 MB", () => {
  assert.equal(MAX_COVER_BYTES, 5 * 1024 * 1024);
});

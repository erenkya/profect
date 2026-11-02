import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPostImageKey, extractPostImageKeys, isPostImageKey, isPostImageType, postImageContentType, postImageKeyFromName, postImageUrl } from "./post-key.ts";

const KEY = "gorseller/a1b2c3d4e5f60718.png";

test("buildPostImageKey türe göre uzantı seçer", () => {
  assert.equal(buildPostImageKey("image/png", "a1b2c3d4e5f60718"), KEY);
  assert.equal(buildPostImageKey("image/jpeg", "a1b2c3d4e5f60718"), "gorseller/a1b2c3d4e5f60718.jpg");
  assert.equal(buildPostImageKey("image/gif", "a1b2c3d4e5f60718"), "gorseller/a1b2c3d4e5f60718.gif");
});

test("isPostImageType jpeg/png/webp/gif kabul eder, svg ve videoyu reddeder", () => {
  for (const t of ["image/jpeg", "image/png", "image/webp", "image/gif"]) assert.ok(isPostImageType(t), t);
  for (const t of ["image/svg+xml", "video/mp4", "text/html"]) assert.ok(!isPostImageType(t), t);
});

test("isPostImageKey biçimi doğrular, path traversal ve başka klasörleri reddeder", () => {
  assert.ok(isPostImageKey(KEY));
  for (const bad of ["", "gorseller/a1b2c3d4.png", "gorseller/A1B2C3D4E5F60718.png", "gorseller/../a1b2c3d4e5f60718.png", "kapaklar/a1b2c3d4e5f60718.png", "gorseller/a1b2c3d4e5f60718.svg", "gorseller/a1b2c3d4e5f60718.png/x", " gorseller/a1b2c3d4e5f60718.png"]) {
    assert.ok(!isPostImageKey(bad), bad);
  }
});

test("postImageUrl / postImageKeyFromName gidiş-dönüş yapar", () => {
  assert.equal(postImageUrl(KEY), "/api/gorsel/a1b2c3d4e5f60718.png");
  assert.equal(postImageUrl(null), null);
  assert.equal(postImageUrl("gorseller/../x.png"), null);
  assert.equal(postImageKeyFromName("a1b2c3d4e5f60718.png"), KEY);
  assert.equal(postImageKeyFromName("../a1b2c3d4e5f60718.png"), null);
  assert.equal(postImageContentType(KEY), "image/png");
  assert.equal(postImageContentType("x"), null);
});

test("extractPostImageKeys içerikteki ve kapaktaki görselleri tekrarsız toplar", () => {
  const md = "![a](/api/gorsel/a1b2c3d4e5f60718.png)\n\n![b](/api/gorsel/00ff00ff00ff00ff.jpg) ve tekrar ![c](/api/gorsel/a1b2c3d4e5f60718.png) ![d](https://x.com/api/gorsel/zz.png)";
  assert.deepEqual(extractPostImageKeys(md, "gorseller/1111111111111111.webp").sort(), ["gorseller/00ff00ff00ff00ff.jpg", "gorseller/1111111111111111.webp", KEY].sort());
  assert.deepEqual(extractPostImageKeys("metin", null), []);
  assert.deepEqual(extractPostImageKeys("", "kapaklar/12-a1b2c3d4.jpg"), []);
});

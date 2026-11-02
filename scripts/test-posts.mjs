// Blog/haber uçtan uca denetimi (çalışan dev sunucusu + gerçek DB/R2 gerekir; geçici kayıt/nesneler sonunda silinir).
// Yönetici oturumu gerektiren uçlar burada yalnızca "girişsiz reddedilir" diye denetlenir.
// Kullanım: npm run test:posts   (APP_URL ya da http://localhost:3000)
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import mysql from "mysql2/promise";
import { buildPostImageKey, postImageUrl } from "../src/lib/post-key.ts";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const Bucket = process.env.R2_BLOG_BUCKET;
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const conn = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

// 1×1 şeffaf PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const key = buildPostImageKey("image/png", crypto.randomBytes(8).toString("hex"));
const slug = `test-${crypto.randomBytes(4).toString("hex")}`;
let postId = null;
let failed = 0;
const step = async (name, fn) => {
  try { await fn(); console.log("✓", name); } catch (e) { failed++; console.log("✗", name, "—", e.message); }
};

try {
  await step("girişsiz yönetici uçları 401/403 döner", async () => {
    for (const [method, url] of [["POST", "/api/admin/posts"], ["PATCH", "/api/admin/posts/1"], ["DELETE", "/api/admin/posts/1"], ["POST", "/api/admin/uploads/post-image"]]) {
      const r = await fetch(base + url, { method, headers: { "content-type": "application/json" }, body: method === "DELETE" ? undefined : "{}" });
      assert.ok(r.status === 401 || r.status === 403, `${method} ${url} → ${r.status}`);
    }
    assert.equal((await fetch(base + "/admin/yazilar", { redirect: "manual" })).status, 307);
  });

  await step("imzalı PUT ile görsel R2 blog bucket'ına yüklenir (ContentLength + Content-Type imzalı)", async () => {
    const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: "image/png", ContentLength: PNG.length }), { expiresIn: 60 });
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: PNG });
    assert.ok(res.ok, `PUT ${res.status}`);
    assert.equal((await s3.send(new HeadObjectCommand({ Bucket, Key: key }))).ContentLength, PNG.length);
  });

  await step("/api/gorsel/<ad> görseli doğru türle, değişmez önbellekle sunar", async () => {
    const r = await fetch(base + postImageUrl(key));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.match(r.headers.get("cache-control") ?? "", /immutable/);
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
  });

  await step("imzalı adres, imzalanandan büyük gövdeyi reddeder (boyut sınırı)", async () => {
    const k2 = buildPostImageKey("image/png", crypto.randomBytes(8).toString("hex"));
    const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: k2, ContentType: "image/png", ContentLength: PNG.length }), { expiresIn: 60 });
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" }, body: Buffer.concat([PNG, Buffer.alloc(4096)]) });
    await s3.send(new DeleteObjectCommand({ Bucket, Key: k2 })).catch(() => {});
    assert.ok(!res.ok, `büyük gövde kabul edildi (${res.status})`);
  });

  await step("/api/gorsel geçersiz/olmayan adları 404 yapar (path traversal dahil)", async () => {
    for (const name of ["zzzz.png", "..%2Fx.png", "0000000000000000.png", "0000000000000000.svg"]) {
      assert.equal((await fetch(`${base}/api/gorsel/${name}`)).status, 404, name);
    }
    // Kurs videolarının bucket'ındaki bir anahtar bu uçtan okunamaz
    assert.equal((await fetch(`${base}/api/gorsel/..%2Fkurslar%2Fx.png`)).status, 404);
  });

  await step("yayındaki yazı sayfada görünür; ham HTML/script çalıştırılmaz; taslak 404", async () => {
    const md = `Merhaba **dünya**\n\n<script>window.__xss=1</script>\n\n<img src=x onerror="window.__xss=2">\n\n![test](${postImageUrl(key)})\n\n[dış](https://example.com) [js](javascript:alert(1))\n`;
    const [r] = await conn.execute(
      "INSERT INTO posts (type, slug, title, excerpt, content, cover_key, author, status, published_at) VALUES ('blog',?,?,?,?,?,?, 'published', NOW())",
      [slug, "Test yazısı", "Özet", md, key, "Test"],
    );
    postId = r.insertId;
    const page = await (await fetch(`${base}/blog/${slug}`)).text();
    assert.ok(page.includes("<strong>dünya</strong>"), "markdown işlenmedi");
    assert.ok(!page.includes("<script>window.__xss"), "script etiketi sayfaya girdi");
    assert.ok(!/<img[^>]*onerror/i.test(page), "onerror'lu img sayfaya girdi");
    assert.ok(!/href="javascript:/i.test(page), "javascript: bağlantısı sayfaya girdi");
    assert.ok(page.includes(`src="${postImageUrl(key)}"`), "görsel gömülmedi");
    assert.match(page, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">/);
    assert.ok((await (await fetch(`${base}/blog`)).text()).includes("Test yazısı"), "listede yok");
    assert.equal((await fetch(`${base}/haberler/${slug}`)).status, 404, "tür yanlışken 404 olmalı");
    await conn.execute("UPDATE posts SET status = 'draft' WHERE id = ?", [postId]);
    assert.equal((await fetch(`${base}/blog/${slug}`)).status, 404, "taslak yayında görünmemeli");
    assert.ok(!(await (await fetch(`${base}/blog`)).text()).includes("Test yazısı"), "taslak listede görünmemeli");
  });

  await step("(tür, slug) benzersizdir", async () => {
    await assert.rejects(
      conn.execute("INSERT INTO posts (type, slug, title, content) VALUES ('blog',?, 'x', 'x')", [slug]),
      (e) => e.code === "ER_DUP_ENTRY",
    );
    await conn.execute("INSERT INTO posts (type, slug, title, content) VALUES ('news',?, 'x', 'x')", [slug]).then(([r]) => conn.execute("DELETE FROM posts WHERE id = ?", [r.insertId]));
  });
} finally {
  if (postId) await conn.execute("DELETE FROM posts WHERE id = ?", [postId]);
  await s3.send(new DeleteObjectCommand({ Bucket, Key: key })).catch(() => {});
  await conn.end();
}
console.log(failed ? `\n${failed} adım BAŞARISIZ` : "\nTüm adımlar geçti.");
process.exit(failed ? 1 : 0);

// R2'de DB'den hiçbir kayıtla anılmayan (yüklenip kaydedilmemiş ya da silmesi başarısız olmuş) video/kapak/ders dosyalarını bulur ve siler.
// Güvenlik: yalnızca uygulamanın ürettiği anahtar biçimlerine bakar; 24 saatten genç nesneye dokunmaz; silmeden önce DB'yi yeniden okur;
// referans yoksa ya da yetim oranı aşırıysa durur. Varsayılan kuru çalıştırmadır.
// Kullanım: npm run r2:orphans -- [--apply] [--min-age-hours 24] [--force]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import mysql from "mysql2/promise";
import { findOrphans, MIN_ORPHAN_AGE_MS, sweepProblem } from "../src/lib/r2-orphans.ts";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const apply = flag("apply");
const minAgeMs = opt("min-age-hours") ? Number(opt("min-age-hours")) * 3_600_000 : MIN_ORPHAN_AGE_MS;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const Bucket = process.env.R2_BUCKET;
const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

/** DB'nin anan tüm R2 anahtarları: ders videoları, ders dosyaları, kurs/program kapakları, program tanıtım videoları. */
async function referencedKeys() {
  const out = new Set();
  for (const sql of [
    "SELECT content k FROM lessons WHERE lesson_type = 'video'",
    "SELECT storage_key k FROM lesson_files",
    "SELECT thumbnail_url k FROM courses WHERE thumbnail_url IS NOT NULL",
    "SELECT thumbnail_url k FROM programs WHERE thumbnail_url IS NOT NULL",
    "SELECT intro_video_key k FROM programs WHERE intro_video_key IS NOT NULL",
  ]) {
    const [rows] = await db.query(sql);
    for (const r of rows) out.add(String(r.k));
  }
  return out;
}

async function listAll() {
  const out = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }));
    for (const o of r.Contents ?? []) out.push({ key: o.Key, size: o.Size ?? 0, modified: o.LastModified });
    token = r.NextContinuationToken;
  } while (token);
  return out;
}

const objects = await listAll(); // önce R2, sonra DB: arada kaydedilen yeni yükleme "bağlı" görünür
const referenced = await referencedKeys();
const { managed, orphans, tooNew } = findOrphans(objects, referenced, Date.now(), minAgeMs);

const mb = (n) => (n / 1048576).toFixed(1).padStart(7);
console.log(`R2: ${objects.length} nesne, yönetilen ${managed}, DB'de bağlı ${referenced.size}, yetim ${orphans.length}, yeni olduğu için atlanan ${tooNew.length}`);
for (const o of orphans) console.log(`${mb(o.size)} MB  ${o.modified.toISOString()}  ${o.key}`);
const total = orphans.reduce((a, o) => a + o.size, 0);
console.log(`silinecek: ${orphans.length} nesne, ${(total / 1073741824).toFixed(2)} GB`);

const problem = flag("force") ? null : sweepProblem(managed, referenced.size, orphans.length);
if (problem) { console.error("DURDURULDU:", problem); await db.end(); process.exit(1); }
if (!apply || !orphans.length) { console.log(apply ? "Silinecek bir şey yok." : "(kuru çalıştırma: --apply ile silinir)"); await db.end(); process.exit(0); }

// Silmeden hemen önce yeniden doğrula: bu arada bir kayda bağlanan nesne korunur.
const fresh = await referencedKeys();
const doomed = orphans.filter((o) => !fresh.has(o.key));
const manifest = path.join(os.tmpdir(), `r2-orphans-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(manifest, JSON.stringify(doomed, null, 2)); // geri dönüş yok: ne silindiği iz olarak kalsın

let deleted = 0;
for (let i = 0; i < doomed.length; i += 1000) {
  const batch = doomed.slice(i, i + 1000);
  const r = await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: batch.map((o) => ({ Key: o.key })), Quiet: true } }));
  for (const e of r.Errors ?? []) console.error("silinemedi:", e.Key, e.Code, e.Message);
  deleted += batch.length - (r.Errors?.length ?? 0);
}
console.log(`Silindi: ${deleted}/${doomed.length}. Kayıt: ${manifest}`);
await db.end();
if (deleted !== doomed.length) process.exit(1);

// "Tedarik Zinciri Ana Eğitimi" klasöründeki videoları R2'ye yükler ve her birini ilgili modüle video dersi olarak ekler.
// Klasör adı "<no> <harf>-<sıra> – …" biçimindedir; harf kursu (A→PRF-TZ101 …), sıra modülü (sort_order = sıra-1) belirler.
// Modül klasöründe derse bağlı olmayan, boyutu birebir aynı bir R2 nesnesi varsa (elle yüklenip kaydedilmemiş) yeniden yüklenmez, derse bağlanır.
// Videosu olan modül atlanır → tekrar çalıştırmak güvenlidir. Birden fazla dolu .mp4 olan klasör atlanır; --pick ile seçilir.
// Kullanım: npm run videos:upload -- [--dry] [--only 1,2,3] [--pick 12="dosya.mp4"] [--concurrency 3]
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mysql from "mysql2/promise";
import { buildVideoKey, moduleFolder, randomId } from "../src/lib/video-key.ts";

const ROOT = path.resolve("Tedarik Zinciri Ana Eğitimi");
const COURSE_BY_LETTER = { A: "PRF-TZ101", B: "PRF-TZ102", C: "PRF-TZ103", D: "PRF-TZ104", E: "PRF-TZ105" };
const sh = promisify(execFile);

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const dry = flag("dry");
const only = opt("only")?.split(",").map(Number);
const concurrency = Number(opt("concurrency") ?? 3);
const picks = Object.fromEntries(args.flatMap((a, i) => (args[i - 1] === "--pick" ? [a.split(/=(.*)/s).slice(0, 2)] : [])));

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const Bucket = process.env.R2_BUCKET;
const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

/** Klasörde (arşiv hariç) dolu .mp4 dosyalarını bulur. */
function findMp4s(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^ar[sş]iv$/i.test(e.name) || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findMp4s(p));
    else if (/\.mp4$/i.test(e.name) && fs.statSync(p).size > 0) out.push(p);
  }
  return out;
}

// — Plan —
const jobs = [];
for (const name of fs.readdirSync(ROOT).sort((a, b) => parseInt(a) - parseInt(b))) {
  const m = /^(\d+) ([A-E])-(\d+) /.exec(name);
  if (!m || !fs.statSync(path.join(ROOT, name)).isDirectory()) continue;
  const no = Number(m[1]);
  if (only && !only.includes(no)) continue;
  const [rows] = await db.query(
    `SELECT m.id, m.title, c.slug course_slug, (SELECT COUNT(*) FROM lessons l WHERE l.module_id = m.id AND l.lesson_type = 'video') videos
       FROM modules m JOIN courses c ON c.id = m.course_id WHERE c.code = ? AND m.sort_order = ?`,
    [COURSE_BY_LETTER[m[2]], Number(m[3]) - 1],
  );
  const mod = rows[0];
  const job = { no, label: `${m[2]}-${m[3]}`, mod };
  if (!mod) { jobs.push({ ...job, skip: "modül bulunamadı" }); continue; }
  if (mod.videos) { jobs.push({ ...job, skip: "videosu zaten var" }); continue; }
  let files = findMp4s(path.join(ROOT, name));
  if (picks[no]) files = files.filter((f) => path.basename(f) === picks[no]);
  if (files.length !== 1) { jobs.push({ ...job, skip: files.length ? `birden fazla dosya: ${files.map((f) => path.basename(f)).join(", ")}` : "video dosyası yok" }); continue; }
  jobs.push({ ...job, file: files[0], size: fs.statSync(files[0]).size });
}

for (const j of jobs) console.log(String(j.no).padStart(2), j.label.padEnd(5), j.skip ? `ATLANDI (${j.skip})` : `${(j.size / 1048576).toFixed(0)} MB · ${j.mod.title}`);
const todo = jobs.filter((j) => !j.skip);
console.log(`\n${todo.length} video yüklenecek, ${jobs.length - todo.length} atlandı.${dry ? " (--dry: yükleme yapılmadı)" : ""}`);
if (dry) { await db.end(); process.exit(0); }

// — Yükleme —
async function put(key, file, size) {
  for (let attempt = 1; ; attempt++) {
    try {
      await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: fs.createReadStream(file), ContentLength: size, ContentType: "video/mp4" }));
      return;
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`  ! deneme ${attempt} başarısız (${err.name}); tekrar deneniyor…`);
    }
  }
}

/** Modül klasöründe, hiçbir derse bağlı olmayan ve boyutu dosyayla aynı olan R2 nesnesinin anahtarı (yoksa null). */
async function findOrphan(j) {
  const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: moduleFolder(j.mod.course_slug, j.mod.id, j.mod.title) }));
  for (const o of r.Contents ?? []) {
    if (o.Size !== j.size) continue;
    const [used] = await db.query("SELECT 1 FROM lessons WHERE content = ?", [o.Key]);
    if (!used.length) return o.Key;
  }
  return null;
}

async function run(j) {
  const { stdout } = await sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", j.file]);
  const minutes = Math.max(1, Math.round(parseFloat(stdout) / 60));
  const t0 = Date.now();
  const adopted = await findOrphan(j);
  const key = adopted ?? buildVideoKey(j.mod.course_slug, j.mod.id, j.mod.title, j.mod.title, randomId());
  if (!adopted) await put(key, j.file, j.size);
  try {
    await db.execute(
      `INSERT INTO lessons (module_id, title, lesson_type, content, duration_minutes, instructor_id, sort_order)
       SELECT ?, ?, 'video', ?, ?, NULL, COALESCE(MAX(sort_order) + 1, 0) FROM lessons WHERE module_id = ?`,
      [j.mod.id, j.mod.title, key, minutes, j.mod.id],
    );
  } catch (err) {
    if (!adopted) await s3.send(new DeleteObjectCommand({ Bucket, Key: key })).catch(() => {}); // kayıt oluşmadıysa yetim nesne bırakma (var olanı silme)
    throw err;
  }
  console.log(`✓ ${String(j.no).padStart(2)} ${j.label} · ${minutes} dk · ${adopted ? "R2'de vardı, bağlandı" : `${((Date.now() - t0) / 1000).toFixed(0)} sn`}`);
}

const queue = [...todo];
const failed = [];
await Promise.all(Array.from({ length: concurrency }, async () => {
  for (let j; (j = queue.shift()); ) {
    try { await run(j); } catch (err) { failed.push(j); console.error(`✗ ${j.no} ${j.label}: ${err.message}`); }
  }
}));
console.log(`\nBitti: ${todo.length - failed.length} yüklendi, ${failed.length} başarısız.`);
await db.end();
process.exit(failed.length ? 1 : 0);

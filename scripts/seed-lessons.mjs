// Markdown metin derslerini (db/seed/lessons/<kurs-slug>/*.md) kursun ilk modülünün sonuna ekler.
// Dosya başındaki front matter'da `title` (zorunlu) ve `duration` (dk, isteğe bağlı; yoksa okuma hızından hesaplanır) bulunur.
// Aynı modülde aynı başlıklı ders varsa dokunmaz → tekrar çalıştırmak güvenlidir. `--update` ise var olan dersin içeriğini ve süresini dosyadakiyle değiştirir (panelden yapılan düzenlemelerin üzerine yazar).
// Kullanım: npm run db:seed-lessons -- <kurs-slug> [--dry-run] [--update]
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const [slug, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const update = flags.includes("--update");
if (!slug) {
  console.error("Kullanım: npm run db:seed-lessons -- <kurs-slug> [--dry-run] [--update]");
  process.exit(1);
}
const dir = path.resolve("db/seed/lessons", slug);
if (!fs.existsSync(dir)) {
  console.error(`Klasör yok: ${dir}`);
  process.exit(1);
}

function parse(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n+([\s\S]*)$/);
  if (!m) throw new Error("Front matter bulunamadı.");
  const meta = Object.fromEntries(m[1].split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
  if (!meta.title) throw new Error("title eksik.");
  const content = m[2].trim();
  const minutes = Number(meta.duration) || Math.max(3, Math.ceil(content.split(/\s+/).length / 180));
  return { title: meta.title, content, minutes };
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [courses] = await conn.query("SELECT id, title FROM courses WHERE slug = ?", [slug]);
if (!courses.length) throw new Error(`Kurs bulunamadı: ${slug}`);
const [modules] = await conn.query("SELECT id, title FROM modules WHERE course_id = ? ORDER BY sort_order, id LIMIT 1", [courses[0].id]);
if (!modules.length) throw new Error("Kursun modülü yok.");
const moduleId = modules[0].id;
console.log(`Kurs: ${courses[0].title} · Modül #${moduleId}: ${modules[0].title}${dryRun ? " (dry-run)" : ""}`);

let added = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
  const d = parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const [exists] = await conn.query("SELECT id FROM lessons WHERE module_id = ? AND title = ?", [moduleId, d.title]);
  if (exists.length && update) {
    if (!dryRun) await conn.execute("UPDATE lessons SET content = ?, duration_minutes = ? WHERE id = ?", [d.content, d.minutes, exists[0].id]);
    console.log(dryRun ? "~ güncellenecek" : "✓ güncellendi", d.title);
    added++;
    continue;
  }
  if (exists.length) {
    console.log("• atlandı", d.title);
    continue;
  }
  if (!dryRun) {
    await conn.execute(
      `INSERT INTO lessons (module_id, title, lesson_type, content, duration_minutes, sort_order)
       SELECT ?, ?, 'text', ?, ?, COALESCE(MAX(sort_order) + 1, 0) FROM lessons WHERE module_id = ?`,
      [moduleId, d.title, d.content, d.minutes, moduleId],
    );
  }
  console.log(dryRun ? "~ eklenecek" : "✓ eklendi", `${d.title} (${d.minutes} dk, ${d.content.length} karakter)`);
  added++;
}
console.log(`${added} ders ${dryRun ? "eklenecek/güncellenecek" : "eklendi/güncellendi"}.`);
await conn.end();

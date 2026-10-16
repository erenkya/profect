// Örnek kataloğu (db/seed/courses.json) yükler. Var olan slug'lara dokunmaz → tekrar çalıştırmak güvenlidir.
// Her modüle admin panelinden doldurulmak üzere bir başlangıç metin dersi eklenir; sınav eklenmez.
import fs from "node:fs";
import mysql from "mysql2/promise";

const courses = JSON.parse(fs.readFileSync("db/seed/courses.json", "utf8"));
const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

let added = 0;
for (const c of courses) {
  const [exists] = await conn.query("SELECT id FROM courses WHERE slug = ?", [c.slug]);
  if (exists.length) {
    console.log("• atlandı", c.slug);
    continue;
  }
  await conn.beginTransaction();
  try {
    const [r] = await conn.execute(
      `INSERT INTO courses (slug, code, title, description, category, level, instructor, hours, rating, price, old_price, outcomes, is_published, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
      [c.slug, c.code, c.title, c.description, c.category, c.level, c.instructor, c.hours, c.rating, c.price, c.old_price, JSON.stringify(c.outcomes), c.sort_order],
    );
    for (const [i, title] of c.modules.entries()) {
      const [m] = await conn.execute("INSERT INTO modules (course_id, title, sort_order) VALUES (?,?,?)", [r.insertId, title, i]);
      await conn.execute(
        "INSERT INTO lessons (module_id, title, lesson_type, content, duration_minutes, sort_order) VALUES (?,?,?,?,?,0)",
        [m.insertId, `${title} — giriş`, "text", `# ${title}\n\nBu dersin içeriği admin panelinden eklenecek.`, 10],
      );
    }
    await conn.commit();
    added++;
    console.log("✓ eklendi", c.slug);
  } catch (e) {
    await conn.rollback();
    throw e;
  }
}
console.log(`${added} kurs eklendi.`);
await conn.end();

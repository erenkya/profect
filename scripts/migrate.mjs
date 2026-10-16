// db/migrations/*.sql dosyalarını sırayla uygular; uygulananları schema_migrations'a yazar.
// Kullanım: npm run db:migrate
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const dir = path.resolve("db/migrations");
const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
});

await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  name VARCHAR(190) NOT NULL PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

const [done] = await conn.query("SELECT name FROM schema_migrations");
const applied = new Set(done.map((r) => r.name));

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) {
    console.log("• atlandı  ", file);
    continue;
  }
  await conn.query(fs.readFileSync(path.join(dir, file), "utf8"));
  await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
  console.log("✓ uygulandı", file);
}
await conn.end();

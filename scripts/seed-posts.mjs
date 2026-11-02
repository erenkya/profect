// Örnek blog/haber yazılarını (db/seed/posts/*.md) yükler. Var olan (tür, slug) çiftlerine dokunmaz → tekrar çalıştırmak güvenlidir.
// Dosya başındaki front matter (title, excerpt, author, type, date, cover) forma aktarılanla aynı biçimdedir.
// `cover: <renk>` ve metindeki `{{gorsel:<ad>}}` için marka renginde bir görsel üretilip R2 blog bucket'ına yüklenir (sharp gerekir; yoksa görselsiz eklenir).
// Kullanım: npm run db:seed-posts   (R2_BLOG_BUCKET için önce `npm run r2:blog-setup`)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mysql from "mysql2/promise";
import { buildPostImageKey, postImageUrl } from "../src/lib/post-key.ts";
import { excerptFromMarkdown, parseMarkdownFile } from "../src/lib/post-md.ts";
import { slugify } from "../src/lib/format.ts";

const dir = path.resolve("db/seed/posts");
const PALETTES = { blue: ["#e6edff", "#3a5fdc", "#8ea6f3"], purple: ["#efe9fb", "#4a2a9e", "#a58ae0"], slate: ["#eef6ff", "#486077", "#9ebbd8"] };

let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.log("! sharp bulunamadı: yazılar görselsiz eklenecek.");
}
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

/** Marka stilinde geometrik görsel (elmaslar); varyant `wide` kapak, `plan` yazı içi çizim. */
function artSvg(palette, variant) {
  const [bg, main, soft] = PALETTES[palette] ?? PALETTES.blue;
  const w = 1600, h = 900;
  const diamonds = variant === "plan"
    ? [0, 1, 2, 3].map((i) => `<g transform="translate(${330 + i * 310} 450) rotate(45)"><rect x="-90" y="-90" width="180" height="180" fill="${i === 3 ? main : "none"}" stroke="${main}" stroke-width="3"/><rect x="-45" y="-45" width="90" height="90" fill="${i === 3 ? "#fff" : soft}" opacity="${i === 3 ? 1 : 0.6}"/></g>`).join("") +
      `<path d="M420 450 H 530 M730 450 H 840 M1040 450 H 1150" stroke="${main}" stroke-width="3" stroke-dasharray="10 10"/>`
    : `<g transform="translate(1180 330) rotate(45)"><rect x="-260" y="-260" width="520" height="520" fill="none" stroke="${main}" stroke-width="3"/><rect x="-170" y="-170" width="340" height="340" fill="none" stroke="${soft}" stroke-width="3" stroke-dasharray="14 12"/><rect x="-60" y="-60" width="120" height="120" fill="${main}"/></g>
       <g transform="translate(300 700) rotate(45)"><rect x="-70" y="-70" width="140" height="140" fill="${soft}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${diamonds}</svg>`;
}

async function uploadArt(palette, variant) {
  if (!sharp) return null;
  const png = await sharp(Buffer.from(artSvg(palette, variant))).png().toBuffer();
  const key = buildPostImageKey("image/png", crypto.randomBytes(8).toString("hex"));
  await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BLOG_BUCKET, Key: key, Body: png, ContentType: "image/png" }));
  return key;
}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

let added = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
  const raw = fs.readFileSync(path.join(dir, file), "utf8");
  const p = parseMarkdownFile(raw);
  const type = p.type ?? "blog";
  const slug = slugify(path.basename(file, ".md")).slice(0, 120);
  const [exists] = await conn.query("SELECT id FROM posts WHERE type = ? AND slug = ?", [type, slug]);
  if (exists.length) {
    console.log("• atlandı", type, slug);
    continue;
  }
  let cover = null;
  let content = p.content;
  if (p.cover) cover = await uploadArt(p.cover, "wide");
  for (const m of [...content.matchAll(/\{\{gorsel:(\w+)\}\}/g)]) {
    const key = await uploadArt(p.cover ?? "blue", m[1]);
    const url = postImageUrl(key);
    content = content.replace(m[0], () => (url ? `![${p.title} çizimi](${url})` : ""));
  }
  await conn.execute(
    `INSERT INTO posts (type, slug, title, excerpt, content, cover_key, author, status, published_at)
     VALUES (?,?,?,?,?,?,?, 'published', ?)`,
    [type, slug, p.title, p.excerpt || excerptFromMarkdown(content), content, cover, p.author || "Profect", (p.publishedAt ?? "2026-11-01T09:00").replace("T", " ")],
  );
  console.log("✓ eklendi", type, slug);
  added++;
}
console.log(`${added} yazı eklendi.`);
await conn.end();

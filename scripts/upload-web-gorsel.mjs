// 1211_webGorsel klasöründeki blog/haber görsellerini ve program kapağını R2'ye yükleyip kayıtlara bağlar.
//   • Yazı kapağı        → blog bucket'ı `gorseller/<16 hex>.webp`, posts.cover_key
//   • Yazı içi görseller → aynı bucket, posts.content içinde belirtilen satırdan sonra `![alt](/api/gorsel/<ad>)`
//   • Program kapağı     → ana bucket `kapaklar/p<id>-<8 hex>.webp`, programs.thumbnail_url
// Görseller yüklenmeden önce WebP'ye çevrilir (sharp). Eski kapak/yazı içi görseller DB güncellendikten sonra R2'den silinir.
// Yazı içindeki tek başına duran `![…](/api/gorsel/…)` satırları (tohum verisinin ürettiği çizimler) yeni görsellerle değiştirilir.
// Kullanım: npm run r2:upload-gorsel [-- --dry]   (--dry: hiçbir şey yüklemez/yazmaz, yalnızca planı ve boyutları basar)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import mysql from "mysql2/promise";
import sharp from "sharp";
import { buildPostImageKey, extractPostImageKeys, postImageUrl } from "../src/lib/post-key.ts";
import { buildProgramCoverKey } from "../src/lib/cover-key.ts";

const root = path.resolve("1211_webGorsel");
const dry = process.argv.includes("--dry");

const PROGRAM = { slug: "stratejik-tedarik-zinciri-egitim-programi", file: "programKapağı.png" };

// `after`: yazı içeriğinde bu metinle BAŞLAYAN satırın (başlık ya da paragraf) bittiği yerden sonra eklenir;
// liste ise listenin sonuna kadar ilerlenir.
const POSTS = [
  {
    type: "blog", slug: "online-egitimde-duzenli-calisma", dir: "blog/Online eğitimde düzenli çalışmanın 5 yolu", cover: "kapak.png",
    images: [
      { file: "makalePlaceholder/duzenliCalismaninBesYolu.png", alt: "Düzenli çalışmanın beş yolu: görev listesi, takvim, not alma ve ilerleme takibi", after: "Kendi hızında ilerlemek" },
      { file: "makalePlaceholder/hedefiParcalaraBol.png", alt: "Büyük hedefin, tamamlanan ve bekleyen ders adımlarına bölünmesi", after: "\"Bu ay kursu bitireceğim\"" },
      { file: "makalePlaceholder/kapak.png", alt: "Dizüstü bilgisayar, takvim ve not defteriyle haftalık ders planı", after: "Boş zaman bulmayı beklemek" },
    ],
  },
  {
    type: "blog", slug: "aralikli-tekrar-ile-ogrenme", dir: "blog/aralikliTekrar", cover: "kapak.png",
    images: [{ file: "makalePlaceholder.png", alt: "Aralıklı tekrar takvimi: 1 gün, 3 gün ve 7 gün sonra", after: "- **Bir hafta sonra**" }],
  },
  {
    type: "blog", slug: "sertifika-nasil-dogrulanir", dir: "blog/sertifika", cover: "kapak.png",
    images: [{ file: "sertifikaPlaceholder.png", alt: "Sertifikadaki QR kodun telefonla okutularak doğrulanması", after: "Doğrulama sayfası;" }],
  },
  {
    type: "news", slug: "soru-havuzu-ve-sinavlar", dir: "haber/soruHavuzu", cover: "kapak.png",
    images: [{ file: "makalePlaceholder.png", alt: "Sınavlarda soru havuzu dönemi: her denemede farklı sorular", after: "Eğitmenler ve yöneticiler artık" }],
  },
  {
    type: "news", slug: "hediye-kurs-ozelligi", dir: "haber/hediyeKurs", cover: "kapak.png",
    images: [{ file: "makalePlaceholder.png", alt: "Kurs hediye et: hediye et, bağlantı e-postayla gider, hesabına ekle, hemen öğrenmeye başla", after: "4. Alıcı bağlantıdan" }],
  },
  {
    type: "news", slug: "ders-altinda-soru-sor", dir: "haber/soruSor", cover: "kapak.png",
    images: [{ file: "makalePlaceholder.png", alt: "Dersin altında soru sorma ve eğitmenden yanıt alma", after: "Her dersin altında" }],
  },
];

const IMG_LINE = /^!\[[^\]]*\]\(\/api\/gorsel\/[a-f0-9]{16}\.(?:jpg|png|webp|gif)\)\s*$/;

/** `after` ile başlayan bloğun (paragraf ya da liste) son satırının indeksi; bulunamazsa hata. */
function blockEnd(lines, after) {
  const start = lines.findIndex((l) => l.startsWith(after));
  if (start < 0) throw new Error(`satır bulunamadı: "${after}"`);
  let end = start;
  while (end + 1 < lines.length && lines[end + 1].trim() !== "") end++;
  return end;
}

/** Eski görsel satırlarını atar, yenilerini ilgili blokların altına ekler. */
function placeImages(content, placements) {
  let lines = content.replace(/\r\n?/g, "\n").split("\n").filter((l) => !IMG_LINE.test(l));
  for (const { after, markdown } of placements) {
    const end = blockEnd(lines, after);
    lines.splice(end + 1, 0, "", markdown);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

async function webp(file) {
  const src = fs.readFileSync(path.join(root, file));
  const out = await sharp(src).webp({ quality: 86 }).toBuffer();
  return { body: out, from: src.length };
}

const kb = (n) => `${Math.round(n / 1024)} KB`;
const rnd = (bytes) => crypto.randomBytes(bytes).toString("hex");

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

async function put(Bucket, Key, file) {
  const { body, from } = await webp(file);
  console.log(`  ${dry ? "·" : "↑"} ${Key}  ←  ${file}  (${kb(from)} → ${kb(body.length)})`);
  if (!dry) await s3.send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType: "image/webp" }));
}

async function remove(Bucket, keys) {
  if (!keys.length || dry) return;
  await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
  console.log(`  ✗ R2'den silindi: ${keys.join(", ")}`);
}

// Dosyaların hepsi var mı? Hata durumunda hiçbir şey yüklenmeden çıkılır.
const needed = [PROGRAM.file, ...POSTS.flatMap((p) => [`${p.dir}/${p.cover}`, ...p.images.map((i) => `${p.dir}/${i.file}`)])];
const absent = needed.filter((f) => !fs.existsSync(path.join(root, f)));
if (absent.length) { console.error("Eksik dosya:", absent.join(", ")); process.exit(1); }

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});

try {
  for (const p of POSTS) {
    console.log(`\n${p.type}/${p.slug}`);
    const [[row]] = await conn.query("SELECT id, content, cover_key FROM posts WHERE type = ? AND slug = ?", [p.type, p.slug]);
    if (!row) { console.log("  ! kayıt yok, atlandı"); continue; }

    const coverKey = buildPostImageKey("image/webp", rnd(8));
    const placements = p.images.map((i) => ({ after: i.after, key: buildPostImageKey("image/webp", rnd(8)), file: `${p.dir}/${i.file}`, alt: i.alt }));
    // Önce yerleşimi dene: bir `after` bulunamazsa yükleme yapmadan bu yazıyı atla.
    let content;
    try {
      content = placeImages(row.content, placements.map((x) => ({ after: x.after, markdown: `![${x.alt}](${postImageUrl(x.key)})` })));
    } catch (err) {
      console.log(`  ! ${err.message} — yazı atlandı`);
      continue;
    }

    await put(process.env.R2_BLOG_BUCKET, coverKey, `${p.dir}/${p.cover}`);
    for (const x of placements) await put(process.env.R2_BLOG_BUCKET, x.key, x.file);

    if (!dry) await conn.execute("UPDATE posts SET cover_key = ?, content = ? WHERE id = ?", [coverKey, content, row.id]);
    const stale = extractPostImageKeys(row.content, row.cover_key);
    await remove(process.env.R2_BLOG_BUCKET, stale);
  }

  console.log(`\nprogram/${PROGRAM.slug}`);
  const [[prog]] = await conn.query("SELECT id, thumbnail_url FROM programs WHERE slug = ?", [PROGRAM.slug]);
  if (!prog) console.log("  ! program yok, atlandı");
  else {
    const key = buildProgramCoverKey(prog.id, "image/webp", rnd(4));
    await put(process.env.R2_BUCKET, key, PROGRAM.file);
    if (!dry) await conn.execute("UPDATE programs SET thumbnail_url = ? WHERE id = ?", [key, prog.id]);
    if (prog.thumbnail_url) await remove(process.env.R2_BUCKET, [prog.thumbnail_url]);
  }
  console.log(dry ? "\nDeneme çalıştırması: hiçbir şey yazılmadı." : "\nTamam.");
} finally {
  await conn.end();
}

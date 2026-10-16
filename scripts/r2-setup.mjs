// R2 bucket kurulumu: yazma yetkisini doğrular ve yönetici yüklemesi için CORS kuralı ekler.
// Kullanım: npm run r2:setup   (bucket'a küçük bir test nesnesi yazıp siler; CORS kuralını değiştirir)
import { DeleteObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const need = ["CLOUDFLARE_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) { console.error("Eksik env:", missing.join(", ")); process.exit(1); }

const Bucket = process.env.R2_BUCKET;
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

try {
  const Key = "kurslar/_setup-check.txt";
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: "ok", ContentType: "text/plain" }));
  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
  console.log("✓ yazma/silme yetkisi: OK");
} catch (err) {
  console.error("✗ yazma yetkisi YOK:", err.name, "— R2 API token'ını 'Object Read & Write' yetkisiyle yeniden oluşturun.");
  process.exit(1);
}

const origins = [...new Set([(process.env.APP_URL ?? "").replace(/\/+$/, ""), "http://localhost:3000"].filter(Boolean))];
try {
  await s3.send(new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["PUT"], AllowedHeaders: ["Content-Type"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }] },
  }));
  console.log("✓ CORS uygulandı:", origins.join(", "));
} catch (err) {
  console.log(`! CORS uygulanamadı (${err.name}). Cloudflare panelinde bucket → Settings → CORS Policy'ye şunu ekleyin:`);
  console.log(JSON.stringify([{ AllowedOrigins: origins, AllowedMethods: ["PUT"], AllowedHeaders: ["Content-Type"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }], null, 2));
}

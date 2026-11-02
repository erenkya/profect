// Blog/haber görselleri için ayrı R2 bucket'ı: yoksa oluşturur, yazma yetkisini doğrular, yönetici yüklemesi için CORS ekler.
// Kullanım: npm run r2:blog-setup   (R2_BLOG_BUCKET adlı bucket'ı oluşturur; CORS kuralını değiştirir)
import { CreateBucketCommand, DeleteObjectCommand, HeadBucketCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const need = ["CLOUDFLARE_ACCOUNT_ID", "R2_BLOG_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) { console.error("Eksik env:", missing.join(", ")); process.exit(1); }

const Bucket = process.env.R2_BLOG_BUCKET;
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

let exists = true;
try {
  await s3.send(new HeadBucketCommand({ Bucket }));
  console.log(`• bucket zaten var: ${Bucket}`);
} catch {
  exists = false;
}
if (!exists) {
  try {
    await s3.send(new CreateBucketCommand({ Bucket }));
    console.log(`✓ bucket oluşturuldu: ${Bucket}`);
  } catch (err) {
    console.error(`✗ bucket oluşturulamadı (${err.name}). Cloudflare panelinde R2 → Create bucket ile "${Bucket}" adında (herkese kapalı) bir bucket açın, sonra bu komutu yeniden çalıştırın.`);
    process.exit(1);
  }
}

try {
  const Key = "gorseller/_setup-check.txt";
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: "ok", ContentType: "text/plain" }));
  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
  console.log("✓ yazma/silme yetkisi: OK");
} catch (err) {
  console.error("✗ yazma yetkisi YOK:", err.name, "— R2 API token'ının bu bucket için 'Object Read & Write' yetkisi olmalı.");
  process.exit(1);
}

const origins = [...new Set([(process.env.APP_URL ?? "").replace(/\/+$/, ""), "http://localhost:3000"].filter(Boolean))];
const rules = [{ AllowedOrigins: origins, AllowedMethods: ["PUT"], AllowedHeaders: ["Content-Type"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }];
try {
  await s3.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: rules } }));
  console.log("✓ CORS uygulandı:", origins.join(", "));
} catch (err) {
  console.log(`! CORS uygulanamadı (${err.name}). Cloudflare panelinde bucket → Settings → CORS Policy'ye şunu ekleyin:`);
  console.log(JSON.stringify(rules, null, 2));
}

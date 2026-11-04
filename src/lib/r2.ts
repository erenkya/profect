// Cloudflare R2 (S3 uyumlu) istemcisi. Yalnızca sunucuda kullanılır; gizli anahtarlar tarayıcıya gitmez.
import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ByteRange } from "@/lib/byte-range";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`R2 yapılandırması eksik: ${name}`);
  return v;
}

let client: S3Client | null = null;
function s3(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env("CLOUDFLARE_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
    // R2, SDK'nın varsayılan CRC32 başlıklarını desteklemez; imzalı PUT'u bozmasın.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}
const bucket = () => env("R2_BUCKET");
// Blog/haber görselleri kurs videolarından ayrı bir bucket'ta durur.
const blogBucket = () => env("R2_BLOG_BUCKET");

/** Yönetici yüklemesi için tek anahtara yazan, 10 dk geçerli imzalı PUT. İstemci `headers`'ı aynen göndermeli. */
export async function presignVideoUpload(key: string, size: number): Promise<{ url: string; headers: Record<string, string> }> {
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: "video/mp4", ContentLength: size }),
    { expiresIn: 600 },
  );
  return { url, headers: { "Content-Type": "video/mp4" } };
}

/** Ders dosyası yüklemesi için tek anahtara yazan, 10 dk geçerli imzalı PUT. İçerik türü hep octet-stream (istemci MIME'ına güvenilmez). */
export async function presignFileUpload(key: string, size: number): Promise<{ url: string; headers: Record<string, string> }> {
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: "application/octet-stream", ContentLength: size }),
    { expiresIn: 600 },
  );
  return { url, headers: { "Content-Type": "application/octet-stream" } };
}

/** Ders dosyası indirmesi için 60 sn geçerli imzalı GET; her zaman `attachment` + octet-stream (tarayıcıda satır içi açılmaz). */
export function presignFileDownload(key: string, contentDisposition: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: contentDisposition, ResponseContentType: "application/octet-stream" }),
    { expiresIn: 60 },
  );
}

/** Kapak resmi için tek anahtara yazan, 10 dk geçerli imzalı PUT. İstemci `headers`'ı aynen göndermeli. */
export async function presignCoverUpload(key: string, size: number, contentType: string): Promise<{ url: string; headers: Record<string, string> }> {
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 600 },
  );
  return { url, headers: { "Content-Type": contentType } };
}

/** Blog/haber görseli için tek anahtara yazan, 10 dk geçerli imzalı PUT. İstemci `headers`'ı aynen göndermeli. */
export async function presignPostImageUpload(key: string, size: number, contentType: string): Promise<{ url: string; headers: Record<string, string> }> {
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: blogBucket(), Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 600 },
  );
  return { url, headers: { "Content-Type": contentType } };
}

/** Blog/haber görselini (en çok MAX_POST_IMAGE_BYTES) bütün olarak okur; yoksa null. */
export const getPostImage = (key: string) => readWhole(blogBucket(), key);

const DELETE_ATTEMPTS = 3;

/**
 * Silme çağıranı bozmaz (DB kaydı zaten silinmiştir) ama sessiz de kalmaz: `DeleteObjects` tek tek anahtar hatalarını
 * yanıtın `Errors` listesinde döner (istek başarılı görünür); yalnızca başarısız anahtarlar artan beklemeyle yeniden denenir.
 * Yine de kalanlar loglanır — bunlar R2'de yetim kalır, `npm run r2:orphans` toplar.
 */
async function deleteKeys(Bucket: string, keys: string[], tag: string): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    let pending = keys.slice(i, i + 1000);
    for (let attempt = 1; pending.length > 0 && attempt <= DELETE_ATTEMPTS; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 2)));
      try {
        const res = await s3().send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: pending.map((Key) => ({ Key })), Quiet: true } }));
        const failed = new Set((res.Errors ?? []).map((e) => e.Key));
        pending = pending.filter((k) => failed.has(k));
      } catch (err) {
        console.error(`[${tag}] deneme ${attempt}/${DELETE_ATTEMPTS}`, pending.length, err);
      }
    }
    if (pending.length > 0) console.error(`[${tag}] silinemedi, R2'de yetim kaldı:`, pending);
  }
}

export const deletePostImages = (keys: string[]) => deleteKeys(blogBucket(), keys, "r2.deletePostImages");

/** Kapak resmini (en çok MAX_COVER_BYTES) bütün olarak okur; yoksa null. */
export const getCover = (key: string) => readWhole(bucket(), key);

async function readWhole(Bucket: string, key: string): Promise<{ body: Uint8Array; size: number } | null> {
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket, Key: key }));
    if (!r.Body) return null;
    const body = await r.Body.transformToByteArray();
    return { body, size: body.byteLength };
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function headVideo(key: string): Promise<{ size: number } | null> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: r.ContentLength ?? 0 };
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** Nesnenin [start, end] dilimini akış olarak okur. `total` nesnenin tam boyutudur. */
export async function getVideoRange(key: string, range: ByteRange) {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=${range.start}-${range.end}` }));
  const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(r.ContentRange ?? "");
  if (!r.Body || !m) throw new Error("R2 geçersiz aralık yanıtı döndürdü.");
  return {
    body: r.Body.transformToWebStream() as ReadableStream<Uint8Array>,
    start: Number(m[1]),
    end: Number(m[2]),
    total: Number(m[3]),
    contentLength: r.ContentLength ?? Number(m[2]) - Number(m[1]) + 1,
  };
}

// Silme işlemleri çağıranı bozmaz: hata tekrar denenir, olmazsa loglanır (DB kaydı zaten silinmiştir).
export const deleteVideo = (key: string) => deleteKeys(bucket(), [key], "r2.deleteVideo");

export const deleteVideos = (keys: string[]) => deleteKeys(bucket(), keys, "r2.deleteVideos");

// Kapak resimleri aynı bucket'ta durur; nesne işlemleri anahtardan bağımsızdır.
export const headCover = headVideo;
export const deleteCover = deleteVideo;
// Ders dosyaları da aynı bucket'ta durur.
export const headFile = headVideo;
export const deleteFile = deleteVideo;
export const deleteFiles = deleteVideos;

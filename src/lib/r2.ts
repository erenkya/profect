// Cloudflare R2 (S3 uyumlu) istemcisi. Yalnızca sunucuda kullanılır; gizli anahtarlar tarayıcıya gitmez.
import "server-only";
import {
  DeleteObjectCommand,
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

/** Yönetici yüklemesi için tek anahtara yazan, 10 dk geçerli imzalı PUT. İstemci `headers`'ı aynen göndermeli. */
export async function presignVideoUpload(key: string, size: number): Promise<{ url: string; headers: Record<string, string> }> {
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: "video/mp4", ContentLength: size }),
    { expiresIn: 600 },
  );
  return { url, headers: { "Content-Type": "video/mp4" } };
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

/** Kapak resmini (en çok MAX_COVER_BYTES) bütün olarak okur; yoksa null. */
export async function getCover(key: string): Promise<{ body: Uint8Array; size: number } | null> {
  try {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
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

// Silme işlemleri çağıranı bozmaz: hata loglanır (DB kaydı zaten silinmiştir).
export async function deleteVideo(key: string): Promise<void> {
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (err) {
    console.error("[r2.deleteVideo]", key, err);
  }
}

export async function deleteVideos(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    try {
      await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
    } catch (err) {
      console.error("[r2.deleteVideos]", batch.length, err);
    }
  }
}

// Kapak resimleri aynı bucket'ta durur; nesne işlemleri anahtardan bağımsızdır.
export const headCover = headVideo;
export const deleteCover = deleteVideo;

import { MAX_POST_IMAGE_BYTES, isPostImageType } from "@/lib/post-key";
import { adminApi } from "./api";

/** Görseli doğrudan R2'ye (blog bucket'ına) yükler ve nesne anahtarını döner. Hata mesajı Türkçe `Error` olarak fırlatılır. */
export async function uploadPostImage(file: File, onProgress?: (percent: number) => void): Promise<string> {
  if (!isPostImageType(file.type)) throw new Error("Yalnızca JPG, PNG, WebP veya GIF yüklenebilir.");
  if (file.size > MAX_POST_IMAGE_BYTES) throw new Error("Görsel en çok 8 MB olabilir.");
  const init = await adminApi("POST", "/api/admin/uploads/post-image", { content_type: file.type, size: file.size });
  if (!init.ok) throw new Error(init.message);
  const { key, upload } = init.json as { key: string; upload: { url: string; headers: Record<string, string> } };
  await new Promise<void>((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open("PUT", upload.url);
    for (const [k, v] of Object.entries(upload.headers)) req.setRequestHeader(k, v);
    req.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    req.onload = () => (req.status >= 200 && req.status < 300 ? resolve() : reject(new Error(`Yükleme başarısız (${req.status}).`)));
    req.onerror = () => reject(new Error("Bağlantı hatası; yükleme yarıda kaldı."));
    req.send(file);
  });
  return key;
}

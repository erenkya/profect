import { MAX_LESSON_FILE_BYTES, cleanFileName, isBlockedFileName } from "@/lib/lesson-file";
import { adminApi } from "./api";

/** Dosya adından görünen ad önerisi: uzantısız ad. */
const defaultTitle = (fileName: string) => cleanFileName(fileName).replace(/\.[^.]+$/, "").slice(0, 120) || "Dosya";

/** Yüklemeden önce istemci tarafı kontrol; sorun varsa kullanıcıya gösterilecek mesaj. */
export function lessonFileProblem(f: File): string | null {
  if (isBlockedFileName(f.name)) return `${f.name}: bu dosya türü yüklenemez.`;
  if (f.size < 1) return `${f.name}: dosya boş.`;
  if (f.size > MAX_LESSON_FILE_BYTES) return `${f.name}: dosya en çok 150 MB olabilir.`;
  return null;
}

/**
 * Bir dosyayı derse yükler: imzalı PUT al → R2'ye doğrudan PUT → kaydı oluştur.
 * Başarıda null, hatada gösterilecek mesajı döner. `setXhr` iptal için çalışan isteği dışarı verir.
 */
export async function uploadLessonFile(
  lessonId: number,
  f: File,
  onProgress: (percent: number) => void,
  setXhr: (req: XMLHttpRequest | null) => void,
): Promise<string | null> {
  const problem = lessonFileProblem(f);
  if (problem) return problem;
  onProgress(0);
  try {
    const init = await adminApi("POST", `/api/admin/lessons/${lessonId}/files/upload`, { file_name: f.name, size: f.size });
    if (!init.ok) return `${f.name}: ${init.message}`;
    const { key, upload: u } = init.json as { key: string; upload: { url: string; headers: Record<string, string> } };

    await new Promise<void>((resolve, reject) => {
      const req = new XMLHttpRequest();
      setXhr(req);
      req.open("PUT", u.url);
      for (const [k, val] of Object.entries(u.headers)) req.setRequestHeader(k, val);
      req.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      req.onload = () => (req.status >= 200 && req.status < 300 ? resolve() : reject(new Error(`Yükleme başarısız (${req.status}).`)));
      req.onerror = () => reject(new Error("Bağlantı hatası; yükleme yarıda kaldı."));
      req.onabort = () => reject(new Error("Yükleme iptal edildi."));
      req.send(f);
    });

    const reg = await adminApi("POST", `/api/admin/lessons/${lessonId}/files`, { key, title: defaultTitle(f.name), file_name: f.name, content_type: f.type || "application/octet-stream" });
    return reg.ok ? null : `${f.name}: ${reg.message}`;
  } catch (err) {
    return `${f.name}: ${err instanceof Error ? err.message : "Yükleme başarısız."}`;
  } finally {
    setXhr(null);
  }
}

// R2'de DB'den hiçbir kayıtla anılmayan ("yetim") nesneleri bulma kuralları. Saf fonksiyonlar (Node test edilebilir, sunucu bağımlılığı yok).
// Yetim kaynakları: yüklenip derse/kursa kaydedilmeyen dosyalar (imzalı PUT kayıt tutmaz) ve R2 silmesi hata verip DB satırı gitmiş nesneler.
import { isCoverKey } from "./cover-key.ts";
import { isLessonFileKey } from "./lesson-file.ts";
import { isVideoKey } from "./video-key.ts";

export type R2Object = { key: string; size: number; modified: Date };

/** Yükleme + kaydetme arasındaki makul en uzun süre; bundan genç nesneye dokunulmaz. */
export const MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
/** Yetimler yönetilen nesnelerin bu oranından fazlaysa (yanlış DB'ye bağlanmış olabilir) --force olmadan silinmez. */
export const MAX_ORPHAN_RATIO = 0.5;

/** Uygulamanın kendi ürettiği biçimdeki anahtarlar; başka biçimdeki (elle konmuş) nesneler yönetilmez. */
export function isManagedKey(key: string): boolean {
  return isVideoKey(key) || isCoverKey(key) || isLessonFileKey(key);
}

export function findOrphans(
  objects: R2Object[],
  referenced: ReadonlySet<string>,
  now: number,
  minAgeMs: number = MIN_ORPHAN_AGE_MS,
): { managed: number; orphans: R2Object[]; tooNew: R2Object[] } {
  const managed = objects.filter((o) => isManagedKey(o.key));
  const unreferenced = managed.filter((o) => !referenced.has(o.key));
  return {
    managed: managed.length,
    orphans: unreferenced.filter((o) => now - o.modified.getTime() >= minAgeMs),
    tooNew: unreferenced.filter((o) => now - o.modified.getTime() < minAgeMs),
  };
}

/** Silmeden önce sağlık kontrolü: sorun varsa Türkçe neden, yoksa null. */
export function sweepProblem(managed: number, referencedCount: number, orphanCount: number): string | null {
  if (managed > 0 && referencedCount === 0) return "DB'de hiç referans bulunamadı; yanlış veritabanına bağlı olabilirsiniz.";
  if (managed > 0 && orphanCount / managed > MAX_ORPHAN_RATIO) {
    return `Yönetilen ${managed} nesnenin ${orphanCount} tanesi yetim görünüyor (> %${MAX_ORPHAN_RATIO * 100}); doğrulayıp --force ile yineleyin.`;
  }
  return null;
}

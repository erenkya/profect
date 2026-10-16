import "server-only";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getModuleForKey } from "@/lib/lms";
import { isVideoKey, keyInModule } from "@/lib/video-key";
import { headVideo } from "@/lib/r2";

/** Ders kaydında gelen video anahtarı bu modüle aitse ve R2'de varsa `null`, değilse Türkçe hata mesajı döner. */
export async function validateLessonVideo(key: string, moduleId: number): Promise<string | null> {
  const mod = await getModuleForKey(moduleId);
  if (!mod || !keyInModule(key, mod.course_slug, mod.id)) return "Geçersiz video.";
  if (!(await headVideo(key))) return "Video R2'de bulunamadı; yeniden yükleyin.";
  return null;
}

const SCOPE_SQL = {
  lesson: "SELECT l.content FROM lessons l WHERE l.id = ?",
  module: "SELECT l.content FROM lessons l WHERE l.module_id = ?",
  course: "SELECT l.content FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?",
} as const;

/**
 * Bir ders/modül/kurs kapsamındaki video derslerin R2 anahtarları. Silmeden ÖNCE çağrılır (cascade kayıtları siler).
 * Kurs slug'ı sonradan değişebildiği için klasör öneki yerine DB'deki kesin anahtarlar kullanılır.
 */
export async function listVideoKeys(scope: keyof typeof SCOPE_SQL, id: number): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(`${SCOPE_SQL[scope]} AND l.lesson_type = 'video'`, [id]);
  return rows.map((r) => String(r.content)).filter(isVideoKey);
}

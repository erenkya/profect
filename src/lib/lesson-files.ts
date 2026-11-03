import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";

/** Öğrenciye/yöneticiye gösterilen alanlar; `storage_key` asla istemciye gitmez. */
export type LessonFileItem = { id: number; title: string; file_name: string; size_bytes: number };

const toItem = (r: RowDataPacket): LessonFileItem => ({ id: r.id, title: r.title, file_name: r.file_name, size_bytes: Number(r.size_bytes) });

export async function listLessonFiles(lessonId: number): Promise<LessonFileItem[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, title, file_name, size_bytes FROM lesson_files WHERE lesson_id = ? ORDER BY created_at, id",
    [lessonId],
  );
  return rows.map(toItem);
}

/** Dosya **ve** ders birlikte eşleşmelidir (başka dersin dosyası bu dersin adresinden indirilemez). */
export async function getLessonFileForDownload(lessonId: number, fileId: number): Promise<{ storage_key: string; file_name: string; course_id: number } | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT f.storage_key, f.file_name, m.course_id
       FROM lesson_files f JOIN lessons l ON l.id = f.lesson_id JOIN modules m ON m.id = l.module_id
      WHERE f.id = ? AND f.lesson_id = ?`,
    [fileId, lessonId],
  );
  return (rows[0] as { storage_key: string; file_name: string; course_id: number } | undefined) ?? null;
}

/** Aynı anahtar ikinci kez eklenirse UNIQUE ihlali (`ER_DUP_ENTRY`) fırlatır. */
export async function addLessonFile(d: { lessonId: number; title: string; fileName: string; key: string; size: number; contentType: string }): Promise<number> {
  const [res] = await pool.execute<ResultSetHeader>(
    "INSERT INTO lesson_files (lesson_id, title, file_name, storage_key, size_bytes, content_type) VALUES (?, ?, ?, ?, ?, ?)",
    [d.lessonId, d.title, d.fileName, d.key, d.size, d.contentType],
  );
  return res.insertId;
}

export async function renameLessonFile(fileId: number, title: string): Promise<boolean> {
  const [res] = await pool.execute<ResultSetHeader>("UPDATE lesson_files SET title = ? WHERE id = ?", [title, fileId]);
  return res.affectedRows > 0;
}

/** Satırı siler ve R2 anahtarını döner (çağıran nesneyi siler); yoksa null. */
export async function removeLessonFile(fileId: number): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT storage_key FROM lesson_files WHERE id = ?", [fileId]);
  const key = (rows[0]?.storage_key as string | undefined) ?? null;
  if (!key) return null;
  const [res] = await pool.execute<ResultSetHeader>("DELETE FROM lesson_files WHERE id = ?", [fileId]);
  return res.affectedRows ? key : null;
}

const SCOPE_SQL = {
  lesson: "SELECT f.storage_key FROM lesson_files f WHERE f.lesson_id = ?",
  module: "SELECT f.storage_key FROM lesson_files f JOIN lessons l ON l.id = f.lesson_id WHERE l.module_id = ?",
  course: "SELECT f.storage_key FROM lesson_files f JOIN lessons l ON l.id = f.lesson_id JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?",
} as const;

/** Bir ders/modül/kurs kapsamındaki dosyaların R2 anahtarları. Silmeden ÖNCE çağrılır (cascade kayıtları siler). */
export async function listLessonFileKeys(scope: keyof typeof SCOPE_SQL, id: number): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(SCOPE_SQL[scope], [id]);
  return rows.map((r) => String(r.storage_key));
}

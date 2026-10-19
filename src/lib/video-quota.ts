import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { isQuotaExceeded } from "@/lib/video-key";

/**
 * Kullanıcı × ders × gün akış kotasını tüketir. Kota dolmuşsa `false` döner ve sayacı artırmaz;
 * aksi halde `bytes` ekler ve `true` döner. `total` videonun tam boyutudur.
 */
export async function consumeVideoQuota(userId: number, lessonId: number, bytes: number, total: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT bytes FROM video_stream_usage WHERE user_id = ? AND lesson_id = ? AND day = CURDATE()",
    [userId, lessonId],
  );
  if (isQuotaExceeded(Number(rows[0]?.bytes ?? 0), total)) return false;
  await pool.execute(
    `INSERT INTO video_stream_usage (user_id, lesson_id, day, bytes) VALUES (?, ?, CURDATE(), ?)
     ON DUPLICATE KEY UPDATE bytes = bytes + VALUES(bytes)`,
    [userId, lessonId, bytes],
  );
  return true;
}

/** Girişsiz önizleme için aynı kota, IP özeti × ders × gün üzerinden (ham IP saklanmaz). */
export async function consumePreviewVideoQuota(ipHash: string, lessonId: number, bytes: number, total: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT bytes FROM video_preview_usage WHERE ip_hash = ? AND lesson_id = ? AND day = CURDATE()",
    [ipHash, lessonId],
  );
  if (isQuotaExceeded(Number(rows[0]?.bytes ?? 0), total)) return false;
  await pool.execute(
    `INSERT INTO video_preview_usage (ip_hash, lesson_id, day, bytes) VALUES (?, ?, CURDATE(), ?)
     ON DUPLICATE KEY UPDATE bytes = bytes + VALUES(bytes)`,
    [ipHash, lessonId, bytes],
  );
  return true;
}

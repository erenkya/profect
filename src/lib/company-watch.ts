import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { isWatched } from "@/lib/company-rules";

type Queryable = Pick<PoolConnection, "query" | "execute">;

/** Kullanıcı bu kursta video izlemiş mi: tamamlanmış ders ya da eşik üstü video akışı (`isWatched`). */
export async function hasWatched(conn: Queryable, userId: number, courseId: number): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
              WHERE lp.user_id = ? AND m.course_id = ?) AS completed,
            (SELECT COALESCE(SUM(u.bytes), 0) FROM video_stream_usage u JOIN lessons l ON l.id = u.lesson_id JOIN modules m ON m.id = l.module_id
              WHERE u.user_id = ? AND m.course_id = ?) AS bytes`,
    [userId, courseId, userId, courseId],
  );
  return isWatched({ completedLessons: Number(rows[0].completed), streamBytes: Number(rows[0].bytes) });
}

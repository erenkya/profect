import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { canAccessCourse, getCourseProgress } from "@/lib/lms";

const schema = z.object({ lesson_id: z.coerce.number().int().positive() });

export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?",
      [body.data.lesson_id],
    );
    if (rows.length === 0) return fail("Ders bulunamadı.", 404);
    const courseId = rows[0].course_id as number;

    if (!(await canAccessCourse(userId, courseId))) return fail("Bu kursa erişiminiz yok.", 403);

    await pool.execute("INSERT IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)", [userId, body.data.lesson_id]);
    return ok({ ...(await getCourseProgress(userId, courseId)) });
  } catch (err) {
    return serverError("[POST /api/client/progress/lesson]", err);
  }
}

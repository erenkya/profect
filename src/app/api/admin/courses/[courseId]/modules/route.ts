import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";

const schema = z.object({ title: z.string().trim().min(1).max(255) });

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const courseId = parseId((await params).courseId);
  if (!courseId) return fail("Geçersiz kurs.", 400);
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const [c] = await pool.query<RowDataPacket[]>("SELECT 1 FROM courses WHERE id = ?", [courseId]);
    if (c.length === 0) return fail("Kurs bulunamadı.", 404);
    const [res] = await pool.execute<ResultSetHeader>(
      "INSERT INTO modules (course_id, title, sort_order) SELECT ?, ?, COALESCE(MAX(sort_order) + 1, 0) FROM modules WHERE course_id = ?",
      [courseId, body.data.title, courseId],
    );
    return ok({ moduleId: res.insertId }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/courses/:id/modules]", err);
  }
}

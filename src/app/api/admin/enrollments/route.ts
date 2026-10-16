import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.user_id, e.course_id, e.status, e.source, e.enrolled_at,
              u.full_name AS user_name, u.email AS user_email,
              c.title AS course_title, cert.certificate_code,
              (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
                 JOIN modules m ON m.id = l.module_id WHERE lp.user_id = e.user_id AND m.course_id = e.course_id) AS completed_lessons,
              (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = e.course_id) AS total_lessons
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         JOIN courses c ON c.id = e.course_id
         LEFT JOIN certificates cert ON cert.user_id = e.user_id AND cert.course_id = e.course_id
        ORDER BY e.enrolled_at DESC`,
    );
    return ok({ data: rows });
  } catch (err) {
    return serverError("[GET /api/admin/enrollments]", err);
  }
}

const idList = z.array(z.coerce.number().int().positive()).min(1).max(500);
const postSchema = z.object({ user_ids: idList, course_ids: idList });

/** Toplu atama: kullanıcılar × kurslar. Var olan kayıtlar atlanır. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, postSchema);
  if (body.error) return body.error;
  try {
    const [users] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE id IN (?) AND is_active = 1", [body.data.user_ids]);
    const [courses] = await pool.query<RowDataPacket[]>("SELECT id FROM courses WHERE id IN (?)", [body.data.course_ids]);
    if (users.length === 0) return fail("Geçerli, aktif kullanıcı bulunamadı.", 404);
    if (courses.length === 0) return fail("Geçerli kurs bulunamadı.", 404);

    let created = 0;
    for (const u of users) {
      for (const c of courses) {
        const [res] = await pool.execute<ResultSetHeader>(
          "INSERT IGNORE INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'admin')",
          [u.id, c.id],
        );
        created += res.affectedRows;
      }
    }
    const total = users.length * courses.length;
    return ok({ created, skipped: total - created, message: `${created} kayıt oluşturuldu, ${total - created} zaten kayıtlıydı.` }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/enrollments]", err);
  }
}

/** ?id= tek kayıt · ?user_id= kullanıcının tüm kayıtları */
export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const sp = new URL(request.url).searchParams;
  const id = Number(sp.get("id"));
  const userId = Number(sp.get("user_id"));
  try {
    let res: ResultSetHeader;
    if (Number.isInteger(id) && id > 0) {
      [res] = await pool.execute<ResultSetHeader>("DELETE FROM enrollments WHERE id = ?", [id]);
    } else if (Number.isInteger(userId) && userId > 0) {
      [res] = await pool.execute<ResultSetHeader>("DELETE FROM enrollments WHERE user_id = ?", [userId]);
    } else {
      return fail("'id' veya 'user_id' gerekli.", 400);
    }
    return ok({ message: `${res.affectedRows} kayıt silindi.` });
  } catch (err) {
    return serverError("[DELETE /api/admin/enrollments]", err);
  }
}

import { z } from "zod";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { enrollInProgram, ensureProgramProgress } from "@/lib/programs";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.user_id, e.course_id, e.status, e.source, e.enrolled_at,
              u.full_name AS user_name, u.email AS user_email,
              c.title AS course_title, cert.certificate_code, co.name AS company_name, co.id AS company_id,
              (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
                 JOIN modules m ON m.id = l.module_id WHERE lp.user_id = e.user_id AND m.course_id = e.course_id) AS completed_lessons,
              (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = e.course_id) AS total_lessons
         FROM enrollments e
         JOIN users u ON u.id = e.user_id
         JOIN courses c ON c.id = e.course_id
         LEFT JOIN certificates cert ON cert.user_id = e.user_id AND cert.course_id = e.course_id
         LEFT JOIN company_members cm ON cm.user_id = e.user_id AND cm.status = 'active'
         LEFT JOIN companies co ON co.id = cm.company_id
        ORDER BY e.enrolled_at DESC`,
    );
    return ok({ data: rows });
  } catch (err) {
    return serverError("[GET /api/admin/enrollments]", err);
  }
}

const idList = z.array(z.coerce.number().int().positive()).min(1).max(500);
const optionalIdList = z.array(z.coerce.number().int().positive()).max(500).default([]);
const postSchema = z
  .object({ user_ids: idList, course_ids: optionalIdList, program_ids: optionalIdList })
  .refine((b) => b.course_ids.length + b.program_ids.length > 0, { message: "En az bir kurs veya program seçin." });

/** Toplu atama: kullanıcılar × (kurslar + programlar). Var olan kayıtlar atlanır. Program ataması programın tüm kurslarına da erişim verir. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, postSchema);
  if (body.error) return body.error;
  try {
    const { course_ids, program_ids } = body.data;
    const [users] = await pool.query<RowDataPacket[]>("SELECT id FROM users WHERE id IN (?) AND is_active = 1", [body.data.user_ids]);
    if (users.length === 0) return fail("Geçerli, aktif kullanıcı bulunamadı.", 404);
    const [courses] = course_ids.length ? await pool.query<RowDataPacket[]>("SELECT id FROM courses WHERE id IN (?)", [course_ids]) : [[] as RowDataPacket[]];
    const [programs] = program_ids.length ? await pool.query<RowDataPacket[]>("SELECT id FROM programs WHERE id IN (?)", [program_ids]) : [[] as RowDataPacket[]];
    if (courses.length === 0 && programs.length === 0) return fail("Geçerli kurs veya program bulunamadı.", 404);

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
    const courseTotal = users.length * courses.length;

    // Program üyeliği + programdaki tüm kurslara erişim tek transaction'da; sertifika denetimi commit sonrası (hatası atamayı bozmaz).
    let programCreated = 0;
    for (const u of users) {
      for (const p of programs) {
        const conn = await pool.getConnection();
        let isNew = false;
        try {
          await conn.beginTransaction();
          isNew = await enrollInProgram(conn, u.id, p.id, "admin");
          await conn.commit();
        } catch (err) {
          await conn.rollback();
          throw err;
        } finally {
          conn.release();
        }
        if (isNew) {
          programCreated++;
          await ensureProgramProgress(u.id, { programId: p.id }).catch(console.error);
        }
      }
    }
    const programTotal = users.length * programs.length;

    const parts: string[] = [];
    if (course_ids.length) parts.push(`${created} kurs kaydı oluşturuldu, ${courseTotal - created} zaten kayıtlıydı`);
    if (program_ids.length) parts.push(`${programCreated} program üyeliği oluşturuldu, ${programTotal - programCreated} zaten üyeydi`);
    return ok({ created, skipped: courseTotal - created, program_created: programCreated, program_skipped: programTotal - programCreated, message: parts.join("; ") + "." }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/enrollments]", err);
  }
}

/** ?id= tek kayıt · ?user_id= kullanıcının tüm kayıtları · ?program_enrollment_id= tek program üyeliği (kurs kayıtları ve sertifikalar kalır) */
export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const sp = new URL(request.url).searchParams;
  const id = Number(sp.get("id"));
  const userId = Number(sp.get("user_id"));
  const programEnrollmentId = Number(sp.get("program_enrollment_id"));
  try {
    let res: ResultSetHeader;
    if (Number.isInteger(programEnrollmentId) && programEnrollmentId > 0) {
      [res] = await pool.execute<ResultSetHeader>("DELETE FROM program_enrollments WHERE id = ?", [programEnrollmentId]);
      return ok({ message: `${res.affectedRows} program üyeliği silindi.` });
    }
    if (Number.isInteger(id) && id > 0) {
      [res] = await pool.execute<ResultSetHeader>("DELETE FROM enrollments WHERE id = ?", [id]);
    } else if (Number.isInteger(userId) && userId > 0) {
      [res] = await pool.execute<ResultSetHeader>("DELETE FROM enrollments WHERE user_id = ?", [userId]);
    } else {
      return fail("'id', 'user_id' veya 'program_enrollment_id' gerekli.", 400);
    }
    return ok({ message: `${res.affectedRows} kayıt silindi.` });
  } catch (err) {
    return serverError("[DELETE /api/admin/enrollments]", err);
  }
}

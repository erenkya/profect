import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { COURSE_MINUTES_SQL } from "@/lib/lms";
import { fail, ok, serverError } from "@/lib/http";

/** Herkese açık, salt okunur doğrulama. Yalnızca ad, kurs, tarih ve puan döner. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(code)) return fail("Geçersiz sertifika numarası.", 400);
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.certificate_code, c.issued_at, c.score, u.full_name AS student_name,
              cr.title AS course_title,
              ${COURSE_MINUTES_SQL} AS course_minutes
         FROM certificates c
         JOIN users u ON u.id = c.user_id
         JOIN courses cr ON cr.id = c.course_id
        WHERE c.certificate_code = ?`,
      [code],
    );
    if (rows.length === 0) return fail("Bu numarayla kayıtlı bir sertifika bulunamadı.", 404);
    return ok({ data: rows[0] });
  } catch (err) {
    return serverError("[GET /api/public/certificates/:code]", err);
  }
}

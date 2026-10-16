import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { canAccessCourse, generateCertificateCode } from "@/lib/lms";

const schema = z.object({ course_id: z.coerce.number().int().positive() });

export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  const userId = guard.payload.userId;
  const courseId = body.data.course_id;

  try {
    if (!(await canAccessCourse(userId, courseId))) return fail("Bu kursa erişiminiz yok.", 403);

    const [existing] = await pool.query<RowDataPacket[]>(
      "SELECT certificate_code FROM certificates WHERE user_id = ? AND course_id = ?",
      [userId, courseId],
    );
    if (existing[0]) return ok({ certificate_code: existing[0].certificate_code, message: "Sertifika zaten mevcut." });

    const [quiz] = await pool.query<RowDataPacket[]>("SELECT id FROM quizzes WHERE course_id = ? AND module_id IS NULL LIMIT 1", [courseId]);
    if (quiz.length === 0) return fail("Bu kursun final sınavı yok.", 400);

    const [best] = await pool.query<RowDataPacket[]>(
      "SELECT MAX(score) AS score FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND is_passed = 1",
      [userId, quiz[0].id],
    );
    if (best[0].score == null) return fail("Sertifika için final sınavını geçmelisiniz.", 403);

    // Kod çakışması (çok düşük ihtimal) için birkaç kez dene.
    for (let i = 0; i < 5; i++) {
      const code = generateCertificateCode();
      try {
        await pool.execute("INSERT INTO certificates (user_id, course_id, certificate_code, score) VALUES (?, ?, ?, ?)", [
          userId,
          courseId,
          code,
          best[0].score,
        ]);
        return ok({ certificate_code: code });
      } catch (err) {
        const dup = err as { code?: string; sqlMessage?: string };
        if (dup.code !== "ER_DUP_ENTRY") throw err;
        // (user_id, course_id) çakışması = eş zamanlı istek başka sertifika üretmiş
        if (dup.sqlMessage?.includes("uq_user_course_cert")) {
          const [again] = await pool.query<RowDataPacket[]>(
            "SELECT certificate_code FROM certificates WHERE user_id = ? AND course_id = ?",
            [userId, courseId],
          );
          return ok({ certificate_code: again[0].certificate_code });
        }
      }
    }
    return fail("Sertifika kodu üretilemedi, tekrar deneyin.", 500);
  } catch (err) {
    return serverError("[POST /api/client/certificates/generate]", err);
  }
}

import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { updateProgramSchema } from "@/lib/admin-schemas";
import { getCourseEligibility, getProgramById, listProgramCourses } from "@/lib/programs";
import { courseProblems, priceProblem } from "@/lib/program-rules";

type Ctx = { params: Promise<{ programId: string }> };

/** Yönetici görünümü: taslak dahil program + kursları (program içi sırayla). */
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const programId = parseId((await params).programId);
  if (!programId) return fail("Geçersiz program.", 400);
  try {
    const program = await getProgramById(programId);
    if (!program) return fail("Program bulunamadı.", 404);
    return ok({ program, courses: await listProgramCourses(programId) });
  } catch (err) {
    return serverError("[GET /api/admin/programs/:id]", err);
  }
}

/**
 * Kaydederken her zaman B ≤ S denetlenir. Yayına alırken (ya da yayındaki programın kurs listesi değişirken)
 * ayrıca tüm kurslar yayında olmalı ve soru içeren bir final sınavı bulunmalı.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const programId = parseId((await params).programId);
  if (!programId) return fail("Geçersiz program.", 400);
  const body = await parseBody(request, updateProgramSchema);
  if (body.error) return body.error;
  const { course_ids: courseIds, ...fields } = body.data;

  // v1'de program kapağı yüklenmez; yalnızca mevcut kapak kaldırılabilir.
  if (fields.thumbnail_url) return fail("Program kapağı henüz desteklenmiyor.", 400);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`); // anahtarlar zod şemasından geldiği için güvenli (serbest kullanıcı girdisi değil)
    values.push(key === "is_published" ? (value ? 1 : 0) : value);
  }
  if (sets.length === 0 && !courseIds) return fail("Güncellenecek alan yok.", 400);

  try {
    const current = await getProgramById(programId);
    if (!current) return fail("Program bulunamadı.", 404);

    // Kaydedildikten sonraki durum üzerinden doğrula.
    let courses;
    if (courseIds) {
      courses = await getCourseEligibility(courseIds);
      if (courses.length !== courseIds.length) return fail("Seçilen kurslardan biri bulunamadı.", 400);
    } else {
      courses = await listProgramCourses(programId);
    }
    const published = fields.is_published ?? current.is_published;
    const problems = [priceProblem(fields.price ?? current.price, courses)].filter((m): m is string => !!m);
    if (fields.is_published === true || (courseIds && published)) problems.push(...courseProblems(courses));
    if (problems.length > 0) return fail(problems.join(" "), 400);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (sets.length > 0) await conn.execute<ResultSetHeader>(`UPDATE programs SET ${sets.join(", ")} WHERE id = ?`, [...values, programId] as never[]);
      if (courseIds) {
        // Sıra dizideki konumdur; kurs kümesi değişmese de sort_order yeniden yazılır.
        await conn.execute("DELETE FROM program_courses WHERE program_id = ?", [programId]);
        await conn.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES ?", [courseIds.map((id, i) => [programId, id, i])]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return ok({ message: "Program güncellendi." });
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") return fail("Bu slug veya program kodu zaten kullanılıyor.", 409);
    return serverError("[PATCH /api/admin/programs/:id]", err);
  }
}

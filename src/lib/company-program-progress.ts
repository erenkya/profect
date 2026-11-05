import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import type { ProgressStatus } from "@/lib/company-rules";

export type ProgramProgressRow = {
  assignmentId: number;
  userId: number;
  userName: string;
  userEmail: string;
  programId: number;
  programTitle: string;
  completedCourses: number;
  totalCourses: number;
  status: ProgressStatus;
  certificateCode: string | null;
};

/**
 * Şirketin aktif program atamalarının ilerlemesi (tek sorgu). Tamamlanan kurs = kullanıcının o kurs için sertifikası var; durum:
 * program sertifikası → completed; en az bir kurs sertifikası ya da tamamlanmış ders → in_progress; yoksa not_started.
 */
export async function listProgramProgress(companyId: number): Promise<ProgramProgressRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.id, a.user_id, u.full_name, u.email, a.program_id, p.title, pcert.certificate_code,
            (SELECT COUNT(*) FROM program_courses pc WHERE pc.program_id = a.program_id) AS total_courses,
            (SELECT COUNT(*) FROM program_courses pc JOIN certificates ce ON ce.course_id = pc.course_id AND ce.user_id = a.user_id
              WHERE pc.program_id = a.program_id) AS done_courses,
            (SELECT COUNT(*) FROM program_courses pc JOIN modules m ON m.course_id = pc.course_id JOIN lessons l ON l.module_id = m.id
               JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = a.user_id
              WHERE pc.program_id = a.program_id) AS lessons_done
       FROM company_program_assignments a
       JOIN users u ON u.id = a.user_id
       JOIN programs p ON p.id = a.program_id
       LEFT JOIN program_certificates pcert ON pcert.program_id = a.program_id AND pcert.user_id = a.user_id
      WHERE a.company_id = ? AND a.status = 'active'
      ORDER BY u.full_name, p.title`,
    [companyId],
  );
  return rows.map((r) => {
    const done = Number(r.done_courses);
    const certificateCode: string | null = r.certificate_code ?? null;
    const status: ProgressStatus = certificateCode ? "completed" : done > 0 || Number(r.lessons_done) > 0 ? "in_progress" : "not_started";
    return {
      assignmentId: r.id,
      userId: r.user_id,
      userName: r.full_name,
      userEmail: r.email,
      programId: r.program_id,
      programTitle: r.title,
      completedCourses: done,
      totalCourses: Number(r.total_courses),
      status,
      certificateCode,
    };
  });
}

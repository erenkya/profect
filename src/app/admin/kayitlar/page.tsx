import type { RowDataPacket } from "mysql2";
import { EnrollmentsPanel, type EnrollmentRow, type ProgramEnrollmentRow } from "@/components/admin/EnrollmentsPanel";
import pool from "@/lib/db";
import { listAllCourses } from "@/lib/lms";

export const metadata = { title: "Kayıtlar" };

export default async function AdminEnrollments() {
  const [[rows], [users], courses, [programRows], [programs]] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT e.id, e.user_id, e.course_id, e.status, e.source, e.enrolled_at, u.full_name AS user_name, u.email AS user_email,
              c.title AS course_title, cert.certificate_code, co.name AS company_name, co.id AS company_id,
              (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
                WHERE lp.user_id = e.user_id AND m.course_id = e.course_id) AS completed_lessons,
              (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = e.course_id) AS total_lessons
         FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
         LEFT JOIN certificates cert ON cert.user_id = e.user_id AND cert.course_id = e.course_id
         LEFT JOIN company_members cm ON cm.user_id = e.user_id AND cm.status = 'active'
         LEFT JOIN companies co ON co.id = cm.company_id
        ORDER BY e.enrolled_at DESC LIMIT 1000`,
    ),
    pool.query<RowDataPacket[]>("SELECT id, full_name, email FROM users WHERE is_active = 1 ORDER BY full_name"),
    listAllCourses(),
    pool.query<RowDataPacket[]>(
      `SELECT pe.id, pe.user_id, pe.program_id, pe.source, pe.enrolled_at, u.full_name AS user_name, u.email AS user_email,
              p.title AS program_title, pc.certificate_code
         FROM program_enrollments pe JOIN users u ON u.id = pe.user_id JOIN programs p ON p.id = pe.program_id
         LEFT JOIN program_certificates pc ON pc.user_id = pe.user_id AND pc.program_id = pe.program_id
        ORDER BY pe.enrolled_at DESC LIMIT 1000`,
    ),
    pool.query<RowDataPacket[]>("SELECT id, code, title, is_published FROM programs ORDER BY sort_order, id"),
  ]);
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 24px" }}>Kayıtlar</h1>
      <EnrollmentsPanel
        rows={rows as EnrollmentRow[]}
        programRows={programRows as ProgramEnrollmentRow[]}
        users={users.map((u) => ({ id: u.id, label: `${u.full_name} — ${u.email}` }))}
        courses={courses.map((c) => ({ id: c.id, label: `${c.code} · ${c.title}${c.is_published ? "" : " (taslak)"}` }))}
        programs={programs.map((p) => ({ id: p.id, label: `${p.code} · ${p.title}${p.is_published ? "" : " (taslak)"}` }))}
      />
    </>
  );
}

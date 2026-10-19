import type { RowDataPacket } from "mysql2";
import { EnrollmentsPanel, type EnrollmentRow } from "@/components/admin/EnrollmentsPanel";
import pool from "@/lib/db";
import { listAllCourses } from "@/lib/lms";

export const metadata = { title: "Kayıtlar" };

export default async function AdminEnrollments() {
  const [[rows], [users], courses] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT e.id, e.user_id, e.course_id, e.status, e.source, e.enrolled_at, u.full_name AS user_name, u.email AS user_email,
              c.title AS course_title, cert.certificate_code,
              (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
                WHERE lp.user_id = e.user_id AND m.course_id = e.course_id) AS completed_lessons,
              (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = e.course_id) AS total_lessons
         FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
         LEFT JOIN certificates cert ON cert.user_id = e.user_id AND cert.course_id = e.course_id
        ORDER BY e.enrolled_at DESC LIMIT 1000`,
    ),
    pool.query<RowDataPacket[]>("SELECT id, full_name, email FROM users WHERE is_active = 1 ORDER BY full_name"),
    listAllCourses(),
  ]);
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 24px" }}>Kayıtlar</h1>
      <EnrollmentsPanel
        rows={rows as EnrollmentRow[]}
        users={users.map((u) => ({ id: u.id, label: `${u.full_name} — ${u.email}` }))}
        courses={courses.map((c) => ({ id: c.id, label: `${c.code} · ${c.title}${c.is_published ? "" : " (taslak)"}` }))}
      />
    </>
  );
}

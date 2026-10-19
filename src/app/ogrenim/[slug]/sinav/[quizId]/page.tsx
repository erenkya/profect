import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { QuizPlayer } from "@/components/learn/QuizPlayer";
import { getCurrentUser } from "@/lib/auth";
import pool from "@/lib/db";
import { parseId } from "@/lib/http";
import { canAccessCourse, flattenTree, getCourseBySlug, getCourseTree } from "@/lib/lms";

export const metadata: Metadata = { title: "Sınav" };

export default async function QuizPage({ params }: { params: Promise<{ slug: string; quizId: string }> }) {
  const { slug, quizId } = await params;
  const id = parseId(quizId);
  if (!id) notFound();
  const user = await getCurrentUser();
  const course = await getCourseBySlug(slug, { includeDraft: user?.role === "admin" });
  if (!course) notFound();
  // Sınavlar ücretsiz önizlemeye dahil değil.
  if (!user) redirect(`/giris?next=${encodeURIComponent(`/ogrenim/${slug}/sinav/${id}`)}`);
  if (user.role !== "admin" && !(await canAccessCourse(user.id, course.id))) redirect(`/kurslar/${slug}`);

  const [q] = await pool.query<RowDataPacket[]>(
    `SELECT course_id, title, module_id, passing_score_percentage, duration_minutes,
            (SELECT COUNT(*) FROM questions WHERE quiz_id = quizzes.id) AS question_count
       FROM quizzes WHERE id = ?`,
    [id],
  );
  if (!q[0] || q[0].course_id !== course.id) notFound();

  // Başlangıç ekranı bilgileri. Sınav API'si çağrıldığı an süreli oturum başladığı için bunlar doğrudan okunur;
  // süre ancak "Sınava başla" ile işlemeye başlar.
  const limitSeconds: number | null = q[0].duration_minutes ? q[0].duration_minutes * 60 : null;
  const [[attempts], [open]] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT MAX(score) AS best FROM quiz_attempts WHERE user_id = ? AND quiz_id = ?", [user.id, id]),
    limitSeconds !== null
      ? pool.query<RowDataPacket[]>(
          `SELECT ? - TIMESTAMPDIFF(SECOND, started_at, NOW()) AS remaining FROM quiz_sessions
            WHERE user_id = ? AND quiz_id = ? AND submitted_at IS NULL ORDER BY id DESC LIMIT 1`,
          [limitSeconds, user.id, id],
        )
      : [[] as RowDataPacket[]],
  ]);
  const resumeSeconds = open[0] && Number(open[0].remaining) > 0 ? Number(open[0].remaining) : null;

  const tree = await getCourseTree(course.id, user.id);
  const flow = flattenTree(tree);
  const idx = flow.findIndex((f) => f.kind === "quiz" && f.id === id);
  const next = idx >= 0 ? flow[idx + 1] : undefined;
  const [cert] = await pool.query<RowDataPacket[]>("SELECT certificate_code FROM certificates WHERE user_id = ? AND course_id = ?", [user.id, course.id]);

  return (
    <QuizPlayer
      key={id}
      quizId={id}
      intro={{
        title: q[0].title,
        isFinal: q[0].module_id === null,
        questionCount: Number(q[0].question_count),
        passingScore: q[0].passing_score_percentage,
        durationMinutes: q[0].duration_minutes ?? null,
        bestScore: attempts[0]?.best ?? null,
        resumeSeconds,
      }}
      nextHref={next ? `/ogrenim/${slug}/${next.kind === "lesson" ? "ders" : "sinav"}/${next.id}` : null}
      certificateCode={cert[0]?.certificate_code ?? null}
    />
  );
}

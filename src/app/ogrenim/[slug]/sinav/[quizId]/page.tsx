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
  const user = (await getCurrentUser())!;
  const course = await getCourseBySlug(slug, { includeDraft: user.role === "admin" });
  if (!course) notFound();
  // Sınavlar ücretsiz önizlemeye dahil değil.
  if (user.role !== "admin" && !(await canAccessCourse(user.id, course.id))) redirect(`/kurslar/${slug}`);

  const [q] = await pool.query<RowDataPacket[]>("SELECT course_id FROM quizzes WHERE id = ?", [id]);
  if (!q[0] || q[0].course_id !== course.id) notFound();

  const tree = await getCourseTree(course.id, user.id);
  const flow = flattenTree(tree);
  const idx = flow.findIndex((f) => f.kind === "quiz" && f.id === id);
  const next = idx >= 0 ? flow[idx + 1] : undefined;
  const [cert] = await pool.query<RowDataPacket[]>("SELECT certificate_code FROM certificates WHERE user_id = ? AND course_id = ?", [user.id, course.id]);

  return (
    <QuizPlayer
      key={id}
      quizId={id}
      nextHref={next ? `/ogrenim/${slug}/${next.kind === "lesson" ? "ders" : "sinav"}/${next.id}` : null}
      certificateCode={cert[0]?.certificate_code ?? null}
    />
  );
}

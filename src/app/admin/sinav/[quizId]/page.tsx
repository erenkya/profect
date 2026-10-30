import type { RowDataPacket } from "mysql2";
import { notFound } from "next/navigation";
import { QuizEditor } from "@/components/admin/QuizEditor";
import pool from "@/lib/db";
import { parseId } from "@/lib/http";
import { loadQuizForEditor } from "@/lib/quiz-data";
import { parseByType } from "@/lib/quiz-pool";

export const metadata = { title: "Sınav düzenle" };

export default async function EditQuiz({ params }: { params: Promise<{ quizId: string }> }) {
  const id = parseId((await params).quizId);
  if (!id) notFound();
  const [quiz] = await pool.query<RowDataPacket[]>("SELECT q.id, q.title, q.course_id, q.passing_score_percentage, q.duration_minutes, q.mode, q.draw_count, q.draw_by_type, c.slug FROM quizzes q JOIN courses c ON c.id = q.course_id WHERE q.id = ?", [id]);
  if (!quiz[0]) notFound();
  const questions = await loadQuizForEditor(id);
  return (
    <QuizEditor
      quizId={id}
      courseId={quiz[0].course_id}
      courseSlug={quiz[0].slug}
      initial={{
        title: quiz[0].title,
        passing: quiz[0].passing_score_percentage,
        duration: quiz[0].duration_minutes,
        mode: quiz[0].mode === "pool" ? "pool" : "fixed",
        drawCount: quiz[0].draw_count == null ? null : Number(quiz[0].draw_count),
        drawByType: parseByType(quiz[0].draw_by_type),
        questions,
      }}
    />
  );
}

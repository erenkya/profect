import type { RowDataPacket } from "mysql2";
import { notFound } from "next/navigation";
import { QuizEditor } from "@/components/admin/QuizEditor";
import pool from "@/lib/db";
import { parseId } from "@/lib/http";

export const metadata = { title: "Sınav düzenle" };

export default async function EditQuiz({ params }: { params: Promise<{ quizId: string }> }) {
  const id = parseId((await params).quizId);
  if (!id) notFound();
  const [quiz] = await pool.query<RowDataPacket[]>("SELECT q.id, q.title, q.course_id, q.passing_score_percentage, q.duration_minutes, c.slug FROM quizzes q JOIN courses c ON c.id = q.course_id WHERE q.id = ?", [id]);
  if (!quiz[0]) notFound();
  const [questions] = await pool.query<RowDataPacket[]>("SELECT id, question_text, explanation FROM questions WHERE quiz_id = ? ORDER BY id", [id]);
  const [options] = await pool.query<RowDataPacket[]>("SELECT o.question_id, o.option_text, o.is_correct FROM options o JOIN questions q ON q.id = o.question_id WHERE q.quiz_id = ? ORDER BY o.id", [id]);
  return (
    <QuizEditor
      quizId={id}
      courseId={quiz[0].course_id}
      courseSlug={quiz[0].slug}
      initial={{
        title: quiz[0].title,
        passing: quiz[0].passing_score_percentage,
        duration: quiz[0].duration_minutes,
        questions: questions.map((q) => ({
          question_text: q.question_text,
          explanation: q.explanation ?? "",
          options: options.filter((o) => o.question_id === q.id).map((o) => ({ option_text: o.option_text, is_correct: !!o.is_correct })),
        })),
      }}
    />
  );
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { QuizPlayer } from "@/components/learn/QuizPlayer";
import type { QuizReview } from "@/components/learn/QuizReview";
import { getCurrentUser } from "@/lib/auth";
import pool from "@/lib/db";
import { parseId } from "@/lib/http";
import { canAccessCourse, flattenTree, getCourseBySlug, getCourseTree } from "@/lib/lms";

export const metadata: Metadata = { title: "Sınav" };

/**
 * Son denemenin cevap incelemesi. Doğru/yanlış burada hesaplanır; doğru şıkkın kendisi istemciye gönderilmez
 * (sınav API'siyle aynı kural). Cevapları kaydedilmemiş eski denemeler için null döner.
 */
async function loadReview(userId: number, quizId: number): Promise<QuizReview | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT score, attempted_at, answers FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND answers IS NOT NULL ORDER BY id DESC LIMIT 1",
    [userId, quizId],
  );
  const attempt = rows[0];
  if (!attempt) return null;
  // MySQL JSON kolonu nesne, MariaDB metin döndürür.
  const answers: Record<string, number | null> = typeof attempt.answers === "string" ? JSON.parse(attempt.answers) : attempt.answers;

  // Yönetici sınavı kaydedince sorular yeniden oluşturulur (yeni ID'ler); yalnızca denemedeki sorular incelenebilir.
  const [allQuestions] = await pool.query<RowDataPacket[]>("SELECT id, question_text, explanation FROM questions WHERE quiz_id = ? ORDER BY id", [quizId]);
  const questions = allQuestions.filter((r) => String(r.id) in answers);
  if (questions.length === 0) return null;
  const ids = questions.map((r) => r.id);
  const [options] = ids.length
    ? await pool.query<RowDataPacket[]>("SELECT id, question_id, option_text, is_correct FROM options WHERE question_id IN (?) ORDER BY id", [ids])
    : [[] as RowDataPacket[]];

  const items = questions.map((qr) => {
    const opts = options.filter((o) => o.question_id === qr.id);
    const selectedOptionId = answers[String(qr.id)] ?? null;
    const isCorrect = selectedOptionId !== null && opts.some((o) => o.id === selectedOptionId && o.is_correct === 1);
    return {
      id: qr.id as number,
      text: qr.question_text as string,
      options: opts.map((o) => ({ id: o.id as number, text: o.option_text as string })),
      selectedOptionId,
      isCorrect,
      explanation: !isCorrect ? ((qr.explanation as string | null) ?? null) : null, // yalnızca yanlışlarda
    };
  });

  return {
    score: attempt.score,
    attemptedAt: new Date(attempt.attempted_at).toISOString(),
    correctCount: items.filter((i) => i.isCorrect).length,
    questions: items,
  };
}

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
    pool.query<RowDataPacket[]>("SELECT MAX(score) AS best, MAX(is_passed) AS passed FROM quiz_attempts WHERE user_id = ? AND quiz_id = ?", [user.id, id]),
    limitSeconds !== null
      ? pool.query<RowDataPacket[]>(
          `SELECT ? - TIMESTAMPDIFF(SECOND, started_at, NOW()) AS remaining FROM quiz_sessions
            WHERE user_id = ? AND quiz_id = ? AND submitted_at IS NULL ORDER BY id DESC LIMIT 1`,
          [limitSeconds, user.id, id],
        )
      : [[] as RowDataPacket[]],
  ]);
  const resumeSeconds = open[0] && Number(open[0].remaining) > 0 ? Number(open[0].remaining) : null;
  const passed = attempts[0]?.passed === 1;
  const review = passed ? await loadReview(user.id, id) : null;

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
        courseId: course.id,
        isFinal: q[0].module_id === null,
        questionCount: Number(q[0].question_count),
        passingScore: q[0].passing_score_percentage,
        durationMinutes: q[0].duration_minutes ?? null,
        bestScore: attempts[0]?.best ?? null,
        passed,
        resumeSeconds,
        review,
      }}
      nextHref={next ? `/ogrenim/${slug}/${next.kind === "lesson" ? "ders" : "sinav"}/${next.id}` : null}
      certificateCode={cert[0]?.certificate_code ?? null}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPlayer } from "@/components/learn/LessonPlayer";
import { getCurrentUser } from "@/lib/auth";
import { parseId } from "@/lib/http";
import { canAccessCourse, flattenTree, getCourseBySlug, getCourseTree, getLesson } from "@/lib/lms";

export const metadata: Metadata = { title: "Ders" };

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const id = parseId(lessonId);
  if (!id) notFound();
  const user = (await getCurrentUser())!;
  const course = await getCourseBySlug(slug, { includeDraft: user.role === "admin" });
  const lesson = await getLesson(id);
  // Ders bu kursa ait olmalı (URL'deki slug ile ders eşleşmezse başka kursun içeriği sızmasın).
  if (!course || !lesson || lesson.course_id !== course.id) notFound();

  const enrolled = await canAccessCourse(user.id, course.id);
  const tree = await getCourseTree(course.id, user.id);
  const flow = flattenTree(tree);
  const idx = flow.findIndex((f) => f.kind === "lesson" && f.id === id);
  const next = idx >= 0 ? flow[idx + 1] : undefined;
  const done = flow[idx]?.done ?? false;

  return (
    <div>
      <div className="eyebrow">{lesson.module_title}</div>
      <h1 style={{ fontSize: "clamp(36px,4.5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 28px" }}>{lesson.title}</h1>
      <LessonPlayer
        key={lesson.id}
        lessonId={lesson.id}
        type={lesson.lesson_type}
        content={lesson.content}
        initiallyCompleted={done}
        canTrack={enrolled}
        nextHref={next ? `/ogrenim/${slug}/${next.kind === "lesson" ? "ders" : "sinav"}/${next.id}` : null}
        nextLabel={next ? (next.kind === "quiz" ? "Sınava geç" : "Sonraki ders") : null}
      />
    </div>
  );
}

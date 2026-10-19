import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LessonPlayer } from "@/components/learn/LessonPlayer";
import { getCurrentUser } from "@/lib/auth";
import { parseId } from "@/lib/http";
import { isVideoKey } from "@/lib/video-key";
import { previewLessonIds } from "@/lib/preview";
import { canAccessCourse, flattenTree, getCourseBySlug, getCourseTree, getLesson } from "@/lib/lms";

export const metadata: Metadata = { title: "Ders" };

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const id = parseId(lessonId);
  if (!id) notFound();
  const user = await getCurrentUser();
  const course = await getCourseBySlug(slug, { includeDraft: user?.role === "admin" });
  const lesson = await getLesson(id);
  // Ders bu kursa ait olmalı (URL'deki slug ile ders eşleşmezse başka kursun içeriği sızmasın).
  if (!course || !lesson || lesson.course_id !== course.id) notFound();

  const enrolled = user ? await canAccessCourse(user.id, course.id) : false;
  const tree = await getCourseTree(course.id, user?.id);
  // Erişimi olmayan (girişsiz dahil, yönetici olmayan) kullanıcı yalnızca ücretsiz önizleme derslerini açabilir.
  const previewing = !enrolled && user?.role !== "admin";
  const previewIds = previewLessonIds(tree);
  if (previewing && !previewIds.includes(id)) redirect(`/kurslar/${slug}`);

  const flow = flattenTree(tree);
  const idx = flow.findIndex((f) => f.kind === "lesson" && f.id === id);
  const next = idx >= 0 ? flow[idx + 1] : undefined;
  // Önizlemede sıradaki öğe yalnızca ücretsiz bir ders ise bağlantı verilir; aksi halde kayıt çağrısı gösterilir.
  const nextOpen = next && (!previewing || (next.kind === "lesson" && previewIds.includes(next.id)));
  const done = flow[idx]?.done ?? false;

  return (
    <div>
      <div className="eyebrow">{lesson.module_title}</div>
      <h1 style={{ fontSize: "clamp(36px,4.5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 28px" }}>{lesson.title}</h1>
      <LessonPlayer
        key={lesson.id}
        lessonId={lesson.id}
        type={lesson.lesson_type}
        videoReady={lesson.lesson_type === "video" && isVideoKey(lesson.content)}
        markdown={lesson.lesson_type === "text" ? lesson.content : ""}
        watermark={user ? `${user.full_name} · ${user.email}` : "Profect · Ücretsiz önizleme"}
        initiallyCompleted={done}
        canTrack={enrolled}
        nextHref={next && nextOpen ? `/ogrenim/${slug}/${next.kind === "lesson" ? "ders" : "sinav"}/${next.id}` : null}
        nextLabel={next && nextOpen ? (next.kind === "quiz" ? "Sınava geç" : "Sonraki ders") : null}
      />
      {previewing && !nextOpen && (
        <div className="card blueprint" style={{ background: "#fff", padding: 24, gap: 12, marginTop: 32, maxWidth: 560 }}>
          <div className="card-kicker" style={{ fontSize: 11 }}>Ücretsiz önizleme sona erdi</div>
          <p style={{ margin: 0, fontSize: 16 }}>Devam etmek, sınavlara girmek ve sertifika almak için kursa kaydol.</p>
          <div><Link href={`/kurslar/${slug}`} className="btn btn-primary">Kursa kaydol</Link></div>
        </div>
      )}
    </div>
  );
}

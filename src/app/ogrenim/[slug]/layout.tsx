import { notFound } from "next/navigation";
import { CourseSidebar } from "@/components/learn/CourseSidebar";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { canAccessCourse, getCourseBySlug, getCourseProgress, getCourseTree } from "@/lib/lms";
import { FREE_PREVIEW_LESSONS, previewLessonIds } from "@/lib/preview";

export default async function LearnLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();

  // Yönetici taslak kursları da önizleyebilir; öğrenciler yalnızca yayınlanmış kursları görür.
  // Erişimi olmayanlar yalnızca ilk FREE_PREVIEW_LESSONS dersi (ücretsiz önizleme) açabilir; sayfalar kendi kontrolünü yapar.
  const course = await getCourseBySlug(slug, { includeDraft: user?.role === "admin" });
  if (!course) notFound();
  const enrolled = user ? await canAccessCourse(user.id, course.id) : false;
  const previewing = !enrolled && user?.role !== "admin";

  const [tree, progress] = await Promise.all([
    getCourseTree(course.id, user?.id),
    user ? getCourseProgress(user.id, course.id) : { percentage: 0 },
  ]);

  return (
    <div className="learn-shell">
      <CourseSidebar slug={slug} title={course.title} tree={tree} percentage={progress.percentage} previewIds={previewing ? previewLessonIds(tree) : null} />
      <main className="learn-main">
        {previewing && (
          <div role="status" style={{ marginBottom: 24, padding: "10px 14px", border: "1px solid var(--color-accent-2-300)", background: "var(--color-accent-2-100)", fontSize: 14, display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <span>Ücretsiz önizleme — kursun ilk {FREE_PREVIEW_LESSONS} dersini {user ? "" : "giriş yapmadan "}inceleyebilirsin. İlerlemen kaydedilmez.</span>
            <Link href={`/kurslar/${slug}`} className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 14 }}>Kursa kaydol</Link>
          </div>
        )}
        {!enrolled && !previewing && (
          <div role="status" style={{ marginBottom: 24, padding: "10px 14px", border: "1px solid var(--color-accent-2-300)", background: "var(--color-accent-2-100)", fontSize: 14 }}>
            Yönetici önizlemesi — bu kursa kayıtlı değilsiniz, ilerlemeniz kaydedilmez.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

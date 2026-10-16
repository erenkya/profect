import { notFound, redirect } from "next/navigation";
import { CourseSidebar } from "@/components/learn/CourseSidebar";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCourse, getCourseBySlug, getCourseProgress, getCourseTree } from "@/lib/lms";

export default async function LearnLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/giris?next=${encodeURIComponent(`/ogrenim/${slug}`)}`);

  // Yönetici taslak kursları da önizleyebilir; öğrenciler yalnızca yayınlanmış + erişimi olduğu kursları görür.
  const course = await getCourseBySlug(slug, { includeDraft: user.role === "admin" });
  if (!course) notFound();
  const enrolled = await canAccessCourse(user.id, course.id);
  if (!enrolled && user.role !== "admin") redirect(`/kurslar/${slug}`);

  const [tree, progress] = await Promise.all([getCourseTree(course.id, user.id), getCourseProgress(user.id, course.id)]);

  return (
    <div className="learn-shell">
      <CourseSidebar slug={slug} title={course.title} tree={tree} percentage={progress.percentage} />
      <main className="learn-main">
        {!enrolled && (
          <div role="status" style={{ marginBottom: 24, padding: "10px 14px", border: "1px solid var(--color-accent-2-300)", background: "var(--color-accent-2-100)", fontSize: 14 }}>
            Yönetici önizlemesi — bu kursa kayıtlı değilsiniz, ilerlemeniz kaydedilmez.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Corners } from "@/components/Corners";
import { CertificateButton } from "@/components/learn/CertificateButton";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCourse, flattenTree, getCourseBySlug, getCourseProgress, getCourseTree } from "@/lib/lms";
import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export const metadata: Metadata = { title: "Kurs" };

export default async function CourseOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const course = await getCourseBySlug(slug, { includeDraft: user?.role === "admin" });
  if (!course) notFound();
  // Önizleme modundaki (girişsiz ya da satın almamış) kullanıcı için ilerleme özeti anlamsız; kurs sayfasına yönlendir.
  if (!user || (user.role !== "admin" && !(await canAccessCourse(user.id, course.id)))) redirect(`/kurslar/${slug}`);

  const [tree, progress] = await Promise.all([getCourseTree(course.id, user.id), getCourseProgress(user.id, course.id)]);
  const flow = flattenTree(tree);
  const next = flow.find((f) => !f.done) ?? flow[0];
  const nextHref = next ? `/ogrenim/${slug}/${next.kind === "lesson" ? "ders" : "sinav"}/${next.id}` : null;

  const [certRows] = await pool.query<RowDataPacket[]>("SELECT certificate_code FROM certificates WHERE user_id = ? AND course_id = ?", [user.id, course.id]);
  const certCode: string | null = certRows[0]?.certificate_code ?? null;
  const finalPassed = !!tree.finalQuiz?.passed;
  const started = progress.completedLessons > 0;

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="eyebrow">{course.category} · {course.code}</div>
      <h1 style={{ fontSize: "clamp(40px,5vw,64px)", lineHeight: 0.95, textTransform: "uppercase", margin: "0 0 18px" }}>{course.title}</h1>
      <p style={{ fontSize: 18, color: "var(--muted-72)", marginBottom: 28 }}>{course.description}</p>

      <div className="card blueprint" style={{ background: "#fff", padding: 24, gap: 14, marginBottom: 28 }}>
        <Corners />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, flexWrap: "wrap", gap: 8 }}>
          <span>{progress.completedLessons} / {progress.totalLessons} ders tamamlandı</span>
          <strong style={{ fontWeight: 600 }}>%{progress.percentage}</strong>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.percentage}%` }} /></div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {nextHref ? (
            <Link href={nextHref} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: "12px 24px" }}>
              <Corners />
              {started ? "Devam Et" : "Başla"}
            </Link>
          ) : (
            <span style={{ fontSize: 14, color: "var(--muted-55)" }}>Bu kursun içeriği henüz hazırlanıyor.</span>
          )}
          {certCode ? (
            <Link href={`/sertifika/${certCode}`} className="btn btn-secondary" style={{ fontSize: 17, padding: "12px 24px" }}>Sertifikamı Gör</Link>
          ) : (
            finalPassed && <CertificateButton courseId={course.id} />
          )}
        </div>
      </div>

      {!tree.finalQuiz && <p style={{ fontSize: 14, color: "var(--muted-55)" }}>Bu kurs için henüz final sınavı tanımlanmadığından sertifika alınamaz.</p>}
    </div>
  );
}

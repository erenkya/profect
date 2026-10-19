"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, CirclePlay, FileText, ListChecks, Lock, X } from "lucide-react";
import type { CourseTree } from "@/lib/lms";

/** previewIds: satın almamış kullanıcı için açık (ücretsiz) ders kimlikleri; null → tam erişim. */
export function CourseSidebar({ slug, title, tree, percentage, previewIds }: { slug: string; title: string; tree: CourseTree; percentage: number; previewIds: number[] | null }) {
  const pathname = usePathname();
  const base = `/ogrenim/${slug}`;

  const icon = (done: boolean | undefined, Fallback: typeof FileText) =>
    done ? <Check className="side-check" size={16} strokeWidth={1.5} color="#3a5fdc" style={{ flex: "none", marginTop: 2 }} /> : <Fallback size={16} strokeWidth={1.5} style={{ flex: "none", marginTop: 2, opacity: 0.6 }} />;

  const lockedHref = `/kurslar/${slug}`;
  const lock = <Lock size={16} strokeWidth={1.5} style={{ flex: "none", marginTop: 2, opacity: 0.6 }} />;

  return (
    <aside className="learn-side" aria-label="Kurs müfredatı">
      {/* Ders sayfasında üst menü gizli; dersten çıkış buradan yapılır. */}
      {pathname.startsWith(`${base}/ders/`) && (
        <Link href={previewIds ? lockedHref : "/hesabim/kurslarim"} className="btn btn-secondary side-exit" style={{ padding: "6px 12px", fontSize: 14, marginBottom: 20, display: "inline-flex", gap: 6, alignItems: "center" }}>
          <X size={16} strokeWidth={1.5} />
          Dersten çık
        </Link>
      )}
      <Link href={base} style={{ color: "inherit", textDecoration: "none" }}>
        <div className="card-kicker" style={{ fontSize: 11, marginBottom: 6 }}>Kurs</div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.1, fontWeight: 600, marginBottom: 14 }}>{title}</div>
      </Link>
      {previewIds ? (
        <div style={{ fontSize: 12, color: "var(--muted-55)", margin: "0 0 20px" }}>Ücretsiz önizleme</div>
      ) : (
        <>
          <div className="progress-track" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} aria-label="Kurs ilerlemesi">
            <div className="progress-fill" style={{ width: `${percentage}%` }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-55)", margin: "6px 0 20px" }}>%{percentage} tamamlandı</div>
        </>
      )}

      <nav style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {tree.modules.map((m, i) => (
          <div key={m.id} className="side-group" style={{ "--i": i } as React.CSSProperties}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4 }}>
              {String(i + 1).padStart(2, "0")} · {m.title}
            </div>
            {m.lessons.map((l) => {
              const href = `${base}/ders/${l.id}`;
              if (previewIds && !previewIds.includes(l.id)) {
                return (
                  <Link key={l.id} href={lockedHref} className="side-link" title="Kursa kaydolunca açılır">
                    {lock}
                    <span style={{ opacity: 0.6 }}>{l.title}</span>
                  </Link>
                );
              }
              return (
                <Link key={l.id} href={href} className="side-link" aria-current={pathname === href ? "page" : undefined}>
                  {icon(l.completed, l.lesson_type === "video" ? CirclePlay : FileText)}
                  <span>{l.title}</span>
                  {previewIds && <span className="tag tag-accent" style={{ marginLeft: "auto", fontSize: 10 }}>Ücretsiz</span>}
                </Link>
              );
            })}
            {m.quiz && previewIds && (
              <Link href={lockedHref} className="side-link" title="Kursa kaydolunca açılır">
                {lock}
                <span style={{ opacity: 0.6 }}>{m.quiz.title}</span>
              </Link>
            )}
            {m.quiz && !previewIds && (
              <Link href={`${base}/sinav/${m.quiz.id}`} className="side-link" aria-current={pathname === `${base}/sinav/${m.quiz.id}` ? "page" : undefined}>
                {icon(m.quiz.passed, ListChecks)}
                <span>{m.quiz.title}</span>
              </Link>
            )}
          </div>
        ))}
        {tree.finalQuiz && (
          <div className="side-group" style={{ "--i": tree.modules.length } as React.CSSProperties}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 4 }}>◆ Final</div>
            {previewIds ? (
              <Link href={lockedHref} className="side-link" title="Kursa kaydolunca açılır">
                {lock}
                <span style={{ opacity: 0.6 }}>{tree.finalQuiz.title}</span>
              </Link>
            ) : (
              <Link href={`${base}/sinav/${tree.finalQuiz.id}`} className="side-link" aria-current={pathname === `${base}/sinav/${tree.finalQuiz.id}` ? "page" : undefined}>
                {icon(tree.finalQuiz.passed, ListChecks)}
                <span>{tree.finalQuiz.title}</span>
              </Link>
            )}
          </div>
        )}
      </nav>
    </aside>
  );
}

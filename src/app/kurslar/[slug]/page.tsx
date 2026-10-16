import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Curriculum, type CurriculumModule } from "@/components/Curriculum";
import { PurchasePanel } from "@/components/PurchasePanel";
import { Corners } from "@/components/Corners";
import { BLUE, EXAM_RULES, PURP } from "@/data/courses";
import { getCurrentUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { PLUS_PRICE, canAccessCourse, getCourseBySlug, getCourseTree, paymentMode } from "@/lib/lms";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const course = await getCourseBySlug((await params).slug);
  return course ? { title: course.title, description: course.description } : {};
}

export default async function CoursePage({ params }: Props) {
  const course = await getCourseBySlug((await params).slug);
  if (!course) notFound();

  const user = await getCurrentUser();
  const hasAccess = user ? await canAccessCourse(user.id, course.id) : false;
  const tree = await getCourseTree(course.id);

  const modules: CurriculumModule[] = tree.modules.map((m, i) => {
    const minutes = m.lessons.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);
    return {
      n: String(i + 1).padStart(2, "0"),
      title: m.title,
      meta: `${m.lessons.length} ders${minutes ? ` · ${minutes} dk` : ""}`,
      items: [
        ...m.lessons.map((l) => ({
          t: l.title,
          d: `${l.lesson_type === "video" ? "Video" : "Okuma"}${l.duration_minutes ? ` · ${l.duration_minutes} dk` : ""}`,
          c: BLUE,
        })),
        ...(m.quiz ? [{ t: m.quiz.title, d: `${m.quiz.question_count} soru`, c: PURP }] : []),
      ],
    };
  });
  if (tree.finalQuiz) {
    modules.push({
      n: "◆",
      title: "Final sınavı ve sertifika",
      meta: `${tree.finalQuiz.question_count} soru`,
      items: [
        { t: tree.finalQuiz.title, d: `${tree.finalQuiz.question_count} soru`, c: PURP },
        { t: "Sertifika düzenleme", d: `%${tree.finalQuiz.passing_score_percentage} ve üzeri`, c: PURP },
      ],
    });
  }

  const includes = [
    `${course.hours} saat video ders`,
    `${course.module_count} modül sınavı + final sınavı`,
    "Doğrulanabilir sertifika",
    "Ömür boyu erişim",
    "Mobil ve masaüstü",
  ];

  return (
    <main>
      <section className="grid-bg" style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-divider)", backgroundImage: "linear-gradient(to right, color-mix(in srgb,#3a5fdc 7%,transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb,#3a5fdc 7%,transparent) 1px, transparent 1px)" }}>
        <div aria-hidden data-fx="1" data-py="0.25" data-rot="0.04" data-br="45" style={{ position: "absolute", right: -80, top: 40, width: 420, height: 420, border: "1px solid var(--color-accent-2-300)", transform: "rotate(45deg)" }} />
        <div className="wrap" style={{ position: "relative", paddingBlock: "40px 64px" }}>
          <nav aria-label="Konum" style={{ display: "flex", gap: 8, fontSize: 14, marginBottom: 40, color: "var(--muted-55)" }}>
            <Link href="/kurslar" style={{ color: "inherit" }}>Kurslar</Link>
            <span aria-hidden>/</span>
            <span>{course.category}</span>
          </nav>
          <div style={{ maxWidth: 760 }}>
            <div data-reveal="1" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
              <span className="tag tag-accent">{course.code}</span>
              <span className="tag tag-neutral">{course.level}</span>
              <span className="tag tag-outline">Sertifikalı</span>
            </div>
            <h1 data-reveal="1" data-delay="100" style={{ fontSize: "clamp(48px,6vw,84px)", lineHeight: 0.94, textTransform: "uppercase", margin: "0 0 22px" }}>{course.title}</h1>
            <p data-reveal="1" data-delay="200" style={{ fontSize: 19, color: "color-mix(in srgb,var(--color-text) 74%,transparent)", textWrap: "pretty", marginBottom: 28 }}>{course.description}</p>
            <div data-reveal="1" data-delay="300" style={{ display: "flex", gap: 28, flexWrap: "wrap", fontSize: 15 }}>
              {course.instructor && <span><strong style={{ fontWeight: 600 }}>Eğitmen:</strong> {course.instructor}</span>}
              {course.rating && <span>★ {course.rating}</span>}
              <span>{course.hours} saat · {course.module_count} modül</span>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap detail-grid" style={{ paddingBlock: "64px clamp(80px,10vw,140px)" }}>
        <div className="detail-main">
          {course.outcomes.length > 0 && (
            <div data-reveal="1">
              <h2 style={{ fontSize: 36, textTransform: "uppercase", marginBottom: 24 }}>Neler öğreneceksin</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: "16px 32px" }}>
                {course.outcomes.map((o) => (
                  <div key={o} style={{ display: "flex", gap: 12, fontSize: 16, alignItems: "flex-start" }}>
                    <Check size={20} strokeWidth={1.5} color="#3a5fdc" style={{ flex: "none", marginTop: 2 }} />
                    <span>{o}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div data-reveal="1">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              <h2 style={{ fontSize: 36, textTransform: "uppercase", margin: 0 }}>Müfredat</h2>
              <span style={{ fontSize: 14, color: "var(--muted-55)" }}>{course.module_count} modül · {course.hours} saat</span>
            </div>
            <Curriculum modules={modules} />
          </div>

          <div data-reveal="1">
            <h2 style={{ fontSize: 36, textTransform: "uppercase", marginBottom: 24 }}>Sınav ve sertifikasyon</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 24 }}>
              {EXAM_RULES.map((r) => (
                <div key={r.k} className="card blueprint" style={{ padding: 20, gap: 8 }}>
                  <Corners />
                  <div className="card-kicker" style={{ fontSize: 11, color: r.c }}>{r.k}</div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 34, lineHeight: 1, fontWeight: 700 }}>{r.v}</div>
                  <p className="card-body" style={{ fontSize: 14 }}>{r.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <PurchasePanel
          slug={course.slug}
          title={course.title}
          priceLabel={formatPrice(course.price)}
          oldPriceLabel={course.old_price ? formatPrice(course.old_price) : null}
          plusPriceLabel={formatPrice(PLUS_PRICE)}
          includes={includes}
          loggedIn={!!user}
          hasAccess={hasAccess}
          paymentMode={paymentMode()}
        />
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CourseCard } from "@/components/CourseCard";
import { courseColor, courseDelay } from "@/data/courses";
import { listPublishedCourses } from "@/lib/lms";

export const metadata: Metadata = {
  title: "Tüm kurslar",
  description: "Her kurs modül sınavları ve bir final sınavıyla biter. Geçtiğinde sertifikan otomatik olarak düzenlenir.",
};

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ kategori?: string }> }) {
  const { kategori } = await searchParams;
  const courses = await listPublishedCourses();
  const CATEGORIES = ["Tümü", ...Array.from(new Set(courses.map((c) => c.category).filter(Boolean)))];
  const cat = kategori && CATEGORIES.includes(kategori) ? kategori : "Tümü";
  const list = courses.map((course, index) => ({ course, index })).filter(({ course }) => cat === "Tümü" || course.category === cat);

  return (
    <>
      <main>
        <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-divider)" }}>
          <div aria-hidden data-fx="1" data-py="0.3" data-rot="0.05" data-br="45" style={{ position: "absolute", right: "6%", top: -60, width: 300, height: 300, border: "1px solid var(--color-accent-300)", transform: "rotate(45deg)" }} />
          <div aria-hidden data-fx="1" data-py="0.6" data-br="45" className="brand-diamond" style={{ position: "absolute", right: "calc(6% + 128px)", top: 88, width: 44, height: 44, transform: "rotate(45deg)" }} />
          <div className="wrap" style={{ position: "relative", paddingBlock: "clamp(56px,7vw,96px) 48px" }}>
            <div data-reveal="1" className="eyebrow">Katalog</div>
            <h1 data-reveal="1" data-delay="100" style={{ fontSize: "clamp(56px,7vw,96px)", lineHeight: 0.92, textTransform: "uppercase", margin: "0 0 20px" }}>Tüm kurslar</h1>
            <p data-reveal="1" data-delay="200" style={{ fontSize: 18, maxWidth: 560, color: "var(--muted-72)", marginBottom: 36 }}>
              Her kurs modül sınavları ve bir final sınavıyla biter. Geçtiğinde sertifikan otomatik olarak düzenlenir.
            </p>
            <nav aria-label="Kategori filtresi" data-reveal="1" data-delay="300" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {CATEGORIES.map((c) => (
                <Link
                  key={c}
                  href={c === "Tümü" ? "/kurslar" : `/kurslar?kategori=${encodeURIComponent(c)}`}
                  scroll={false}
                  className={c === cat ? "btn btn-primary" : "btn btn-secondary"}
                  aria-current={c === cat ? "true" : undefined}
                  style={{ fontSize: 15, padding: "8px 16px" }}
                >
                  {c}
                </Link>
              ))}
            </nav>
          </div>
        </section>
        <section className="wrap" style={{ paddingBlock: "56px clamp(80px,10vw,140px)" }}>
          <div style={{ fontSize: 13, color: "var(--muted-55)", marginBottom: 28 }}>{list.length} kurs listeleniyor</div>
          <div className="course-grid">
            {list.map(({ course, index }, i) => (
              <CourseCard key={course.id} course={course} color={courseColor(index)} delay={courseDelay(i)} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

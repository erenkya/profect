import Link from "next/link";
import { Corners } from "./Corners";
import type { CourseRow } from "@/lib/lms";
import { formatPrice } from "@/lib/format";

export function CourseCard({ course, color, delay }: { course: CourseRow; color: string; delay: number }) {
  return (
    <div data-reveal="1" data-delay={delay}>
      <Link href={`/kurslar/${course.slug}`} className="course-link">
        <div className="card blueprint course-card">
          <Corners />
          <div className="course-art">
            <span className="diamond" style={{ position: "absolute", right: -30, top: -30, width: 150, height: 150, border: `1px solid ${color}` }} />
            <span className="diamond" style={{ position: "absolute", right: 30, top: 30, width: 30, height: 30, background: color }} />
            <div style={{ position: "absolute", left: 20, bottom: 16, fontFamily: "var(--font-heading)", fontSize: 44, lineHeight: 1, fontWeight: 700, color }}>
              {course.code}
            </div>
          </div>
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="card-kicker" style={{ fontSize: 11 }}>{course.category}</span>
              <span className="tag tag-neutral">{course.level}</span>
            </div>
            <div className="card-title" style={{ fontSize: 24, lineHeight: 1.1 }}>{course.title}</div>
            <div style={{ fontSize: 14, color: "color-mix(in srgb,var(--color-text) 62%,transparent)" }}>{course.instructor}</div>
            <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="card-meta" style={{ fontSize: 13 }}>
                {course.hours} saat · {course.module_count} modül{course.rating ? ` · ★ ${course.rating}` : ""}
              </span>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, color: "var(--color-accent-2)" }}>
                {formatPrice(course.price)}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

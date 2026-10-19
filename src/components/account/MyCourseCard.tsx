import Link from "next/link";
import { Corners } from "@/components/Corners";
import type { MyCourse } from "@/lib/lms";

export function MyCourseCard({ c }: { c: MyCourse }) {
  return (
    <div className="card blueprint" style={{ background: "#fff", padding: 22, gap: 12 }}>
      <Corners />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span className="card-kicker" style={{ fontSize: 11 }}>{c.category}</span>
        <span className={`tag ${c.status === "completed" ? "tag-accent" : "tag-neutral"}`}>{c.status === "completed" ? "Tamamlandı" : "Devam ediyor"}</span>
      </div>
      <div className="card-title" style={{ fontSize: 24 }}>{c.title}</div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${c.percentage}%` }} /></div>
      <div className="card-meta" style={{ fontSize: 12, justifyContent: "space-between" }}><span>{c.completed_lessons} / {c.lesson_count} ders</span><span>%{c.percentage}</span></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <Link href={`/ogrenim/${c.slug}`} className="btn btn-primary blueprint" style={{ padding: "8px 18px" }}><Corners />{c.completed_lessons > 0 ? "Devam Et" : "Başla"}</Link>
        {c.certificate_code && <Link href={`/sertifika/${c.certificate_code}`} className="btn btn-secondary" style={{ padding: "8px 18px" }}>Sertifika</Link>}
      </div>
    </div>
  );
}

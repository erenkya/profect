import Link from "next/link";
import { Corners } from "./Corners";
import type { ProgramOffer } from "@/lib/programs";
import { formatPrice } from "@/lib/format";
import { coverUrl } from "@/lib/cover-key";

/** Girişliyse `offer` kişiye özeldir: ödenecek tutar edinilmiş kurslar düşülmüş halidir. */
export function ProgramCard({ offer, color, delay, loggedIn }: { offer: ProgramOffer; color: string; delay: number; loggedIn: boolean }) {
  const { program, courses, calc } = offer;
  const cover = coverUrl(program.thumbnail_url);
  const lessons = courses.reduce((s, c) => s + c.lesson_count, 0);
  const personal = loggedIn && calc.ownedCount > 0;
  const shown = personal ? calc.payable : calc.effectivePrice;
  return (
    <div data-reveal="1" data-delay={delay}>
      <div className="card blueprint course-card">
        <Corners />
        <Link href={`/programlar/${program.slug}`} className="course-link">
          <div className="course-art">
            {cover ? (
              <>
                <img src={cover} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <span className="tag tag-accent" style={{ position: "absolute", left: 14, bottom: 14 }}>{program.code}</span>
              </>
            ) : (
              <>
                <span className="diamond" style={{ position: "absolute", right: -30, top: -30, width: 150, height: 150, border: `1px solid ${color}` }} />
                <span className="diamond" style={{ position: "absolute", right: 30, top: 30, width: 30, height: 30, background: color }} />
                <div style={{ position: "absolute", left: 20, bottom: 16, fontFamily: "var(--font-heading)", fontSize: 44, lineHeight: 1, fontWeight: 700, color }}>
                  {program.code}
                </div>
              </>
            )}
          </div>
          <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="card-kicker" style={{ fontSize: 11 }}>{program.category || "Uzmanlık Programı"}</span>
              <span className="tag tag-neutral">{courses.length} kurs</span>
            </div>
            <div className="card-title" style={{ fontSize: 24, lineHeight: 1.1 }}>{program.title}</div>
            <div style={{ fontSize: 14, color: "color-mix(in srgb,var(--color-text) 62%,transparent)" }}>
              {personal ? `Sahip olduğun ${calc.ownedCount} kurs düşüldü` : "Program sertifikalı"}
            </div>
            <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="card-meta" style={{ fontSize: 13 }}>{courses.length} kurs · {lessons} ders</span>
              {offer.member ? (
                <span className="tag tag-accent">Üyesin</span>
              ) : !offer.sellable ? (
                <span style={{ fontSize: 13, color: "var(--muted-55)" }}>Şu an satışta değil</span>
              ) : (
                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  {calc.listTotal > shown && <span style={{ fontSize: 14, textDecoration: "line-through", color: "var(--muted-55)" }}>{formatPrice(calc.listTotal)}</span>}
                  <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, color: "var(--color-accent-2)" }}>{formatPrice(shown)}</span>
                </span>
              )}
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

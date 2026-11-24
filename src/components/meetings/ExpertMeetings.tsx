import Image from "next/image";
import Link from "next/link";
import { EXPERT_IDS, EXPERTS } from "@/data/experts";
import { listAvailableDays } from "@/lib/meetings";

/** Ana sayfa "Uzmanlarla görüşme" bölümü: iki uzman kartı; tıklayınca planlama ayrı sayfada (/gorusme/planla/[uzman]) yapılır. */
export async function ExpertMeetings() {
  let availability: Record<string, boolean>;
  try {
    const days = await Promise.all(EXPERT_IDS.map((id) => listAvailableDays(id, 15)));
    availability = Object.fromEntries(EXPERT_IDS.map((id, i) => [id, days[i].length > 0]));
  } catch (err) {
    console.error("[ExpertMeetings] müsaitlik okunamadı", err);
    return null;
  }
  return (
    <section className="wrap section-pad" style={{ paddingTop: 0 }} aria-labelledby="meet-title">
      <div data-reveal="1" style={{ textAlign: "center", marginBottom: 48 }}>
        <div className="eyebrow">Uzmanlarla görüşme</div>
        <h2 id="meet-title" className="h-section" style={{ margin: "0 auto 12px", maxWidth: 720 }}>Kurucularımızla 30 dakikalık bir görüşme planlayın</h2>
        <p style={{ margin: "0 auto", maxWidth: 560, fontSize: 16, color: "var(--muted-72)" }}>Konunuza uygun uzmanı seçin; gün ve saati bir sonraki adımda belirleyin.</p>
      </div>
      <div className="meet-stage">
        {EXPERT_IDS.map((id) => {
          const x = EXPERTS[id];
          return (
            <Link key={id} href={`/gorusme/planla/${id}`} data-tone={id === "kaan" ? "purple" : "blue"} className="meet-card" aria-label={`${x.name} ile görüşme planla`}>
              <span className="meet-photo" style={{ position: "relative" }}>
                <span className="meet-glow" aria-hidden />
                <span className="meet-ring" aria-hidden />
                <Image src={x.photo} alt="" fill sizes="(max-width: 700px) 50vw, 30vw" />
              </span>
              <span className="meet-info">
                <strong className="meet-name">{x.name}</strong>
                <span className="meet-role">{x.role}</span>
                <span className="meet-topics">
                  {x.topics.map((t, i) => <span key={t} className="meet-topic" style={{ "--i": i } as React.CSSProperties}>{t}</span>)}
                  {!availability[id] && <span className="meet-soon">Takvim yakında açılacak</span>}
                </span>
                <span className="meet-cta" aria-hidden>Görüşme planla →</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

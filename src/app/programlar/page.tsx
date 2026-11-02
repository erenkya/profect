import type { Metadata } from "next";
import { Cta } from "@/components/Cta";
import { ProgramCard } from "@/components/ProgramCard";
import { courseColor, courseDelay } from "@/data/courses";
import { getCurrentUser } from "@/lib/auth";
import { getProgramOffer, listPublishedPrograms } from "@/lib/programs";

export const metadata: Metadata = {
  title: "Uzmanlık programları",
  description: "Birkaç kursu tek pakette topla: ayrı ayrı almaktan daha uygun, tüm kursları bitirince program sertifikası.",
};

// Girişliyse fiyatlar kişiye özel (sahip olunan kurslar düşülür): sayfa dinamik üretilir.
export default async function ProgramsPage() {
  const user = await getCurrentUser();
  const programs = await listPublishedPrograms();
  const offers = (await Promise.all(programs.map((p) => getProgramOffer(p.slug, user?.id ?? null)))).filter((o) => o !== null);

  return (
    <>
      <main>
        <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-divider)" }}>
          <div aria-hidden data-fx="1" data-py="0.3" data-rot="0.05" data-br="45" style={{ position: "absolute", right: "6%", top: -60, width: 300, height: 300, border: "1px solid var(--color-accent-300)", transform: "rotate(45deg)" }} />
          <div aria-hidden data-fx="1" data-py="0.6" data-br="45" className="brand-diamond" style={{ position: "absolute", right: "calc(6% + 128px)", top: 88, width: 44, height: 44, transform: "rotate(45deg)" }} />
          <div className="wrap" style={{ position: "relative", paddingBlock: "clamp(56px,7vw,96px) 48px" }}>
            <div data-reveal="1" className="eyebrow">Paketler</div>
            <h1 data-reveal="1" data-delay="100" style={{ fontSize: "clamp(56px,7vw,96px)", lineHeight: 0.92, textTransform: "uppercase", margin: "0 0 20px" }}>Uzmanlık programları</h1>
            <p data-reveal="1" data-delay="200" style={{ fontSize: 18, maxWidth: 560, color: "var(--muted-72)" }}>
              Birkaç kursu tek pakette topla: ayrı ayrı almaktan daha uygun. Sahip olduğun kurslar fiyattan düşülür, tüm kursları bitirdiğinde program sertifikan otomatik düzenlenir.
            </p>
          </div>
        </section>
        <section className="wrap" style={{ paddingBlock: "56px clamp(80px,10vw,140px)" }}>
          {offers.length === 0 ? (
            <p style={{ color: "var(--muted-72)" }}>Şu an yayında program yok. Yakında burada olacak.</p>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--muted-55)", marginBottom: 28 }}>{offers.length} program listeleniyor</div>
              <div className="course-grid">
                {offers.map((offer, i) => (
                  <ProgramCard key={offer.program.id} offer={offer} color={courseColor(i)} delay={courseDelay(i)} loggedIn={!!user} />
                ))}
              </div>
            </>
          )}
        </section>
      </main>
      <Cta />
    </>
  );
}

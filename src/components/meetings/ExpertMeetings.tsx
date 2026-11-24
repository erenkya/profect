import { EXPERT_IDS, EXPERTS } from "@/data/experts";
import { getCurrentUser } from "@/lib/auth";
import { listAvailableDays } from "@/lib/meetings";
import { turnstileSiteKey } from "@/lib/turnstile";
import { MeetingBooking } from "./MeetingBooking";

/** Ana sayfa "Uzmanlarla görüşme" bölümü. Okunamazsa bölüm hiç gösterilmez (ana sayfa düşmesin). */
export async function ExpertMeetings() {
  let availability: Record<string, boolean>;
  try {
    const days = await Promise.all(EXPERT_IDS.map((id) => listAvailableDays(id, 15)));
    availability = Object.fromEntries(EXPERT_IDS.map((id, i) => [id, days[i].length > 0]));
  } catch (err) {
    console.error("[ExpertMeetings] müsaitlik okunamadı", err);
    return null;
  }
  const user = await getCurrentUser();
  const experts = EXPERT_IDS.map((id) => {
    const { name, role, photo, topics } = EXPERTS[id];
    return { id, name, role, photo, topics, available: availability[id] };
  });
  return (
    <section className="wrap section-pad" style={{ paddingTop: 0 }} aria-labelledby="meet-title">
      <div data-reveal="1" style={{ textAlign: "center", marginBottom: 48 }}>
        <div className="eyebrow">Uzmanlarla görüşme</div>
        <h2 id="meet-title" className="h-section" style={{ margin: "0 auto 12px", maxWidth: 720 }}>Kurucularımızla 30 dakikalık bir görüşme planlayın</h2>
        <p style={{ margin: "0 auto", maxWidth: 560, fontSize: 16, color: "var(--muted-72)" }}>Konunuza uygun uzmanı seçin, size uyan günü ve saati belirleyin; talebinizi iletelim.</p>
      </div>
      <MeetingBooking experts={experts} siteKey={turnstileSiteKey()} prefill={user ? { name: user.full_name ?? "", email: user.email ?? "" } : null} />
    </section>
  );
}

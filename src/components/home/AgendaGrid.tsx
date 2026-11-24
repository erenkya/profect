import Link from "next/link";
import { BarChart3, ShieldCheck, Sparkles, Target, TrendingDown, Users, type LucideIcon } from "lucide-react";
import { AGENDA, AGENDA_HREF, type AgendaIcon } from "@/data/journey";

const ICONS: Record<AgendaIcon, LucideIcon> = {
  "trending-down": TrendingDown,
  "shield-check": ShieldCheck,
  users: Users,
  sparkles: Sparkles,
  target: Target,
  "bar-chart": BarChart3,
};

/** "Bunlardan hangisi sizin gündeminizde?" — problem kartları; hepsi eğitim kataloğuna gider. */
export function AgendaGrid() {
  return (
    <section className="wrap section-pad" style={{ paddingBottom: 0 }} aria-labelledby="agenda-title">
      <div data-reveal="1" style={{ marginBottom: 40, maxWidth: 720 }}>
        <div className="eyebrow">Şu anda profesyonellerin çözmeye çalıştığı problemler</div>
        <h2 id="agenda-title" className="h-section">Bunlardan hangisi sizin gündeminizde?</h2>
      </div>
      <ul className="agenda-grid">
        {AGENDA.map((a, i) => {
          const Icon = ICONS[a.icon];
          return (
            <li key={a.id} data-reveal="1" data-delay={i * 80}>
              <Link href={AGENDA_HREF} className="card agenda-card">
                <Icon size={28} strokeWidth={1.5} aria-hidden color="var(--color-accent)" />
                <span className="card-title">{a.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

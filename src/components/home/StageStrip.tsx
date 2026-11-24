import { ArrowRight } from "lucide-react";
import { STAGES } from "@/data/journey";

/** Hero altındaki Knowledge → Decision → Impact şeridi (Türkçe karşılıklarıyla). */
export function StageStrip() {
  return (
    <ol
      data-reveal="1"
      data-delay="600"
      aria-label="Bilgi, karar, etki"
      style={{ listStyle: "none", margin: "36px 0 0", padding: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 18px" }}
    >
      {STAGES.map((s, i) => (
        <li key={s.key} style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ display: "grid", gap: 2 }}>
            <span style={{ fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", fontWeight: 600, color: "var(--color-accent-700)" }}>{s.en}</span>
            <span style={{ fontSize: 13, color: "var(--muted-55)" }}>{s.tr}</span>
          </span>
          {i < STAGES.length - 1 && <ArrowRight size={16} strokeWidth={1.5} aria-hidden color="var(--color-accent-2)" />}
        </li>
      ))}
    </ol>
  );
}

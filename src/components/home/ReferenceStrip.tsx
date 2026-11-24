import Image from "next/image";
import { REFERENCE_LOGOS, hasReferences } from "@/data/journey";

/** "Deneyimimiz, gücümüz" logo şeridi. Logo verisi boşken hiçbir şey render etmez. */
export function ReferenceStrip() {
  if (!hasReferences()) return null;
  return (
    <section className="wrap" style={{ paddingBlock: "clamp(32px,5vw,64px)", borderBlock: "1px solid var(--color-divider)" }} aria-labelledby="ref-title">
      <div data-reveal="1" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px 48px" }}>
        <div id="ref-title" className="eyebrow" style={{ margin: 0 }}>Deneyimimiz, gücümüz</div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px 40px" }}>
          {REFERENCE_LOGOS.map((l) => (
            <li key={l.name}>
              <Image src={l.src} alt={l.name} width={l.width} height={l.height} style={{ height: 28, width: "auto", opacity: 0.8 }} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

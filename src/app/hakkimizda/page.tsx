import type { Metadata } from "next";
import Image from "next/image";
import { Corners } from "@/components/Corners";
import { FOUNDERS } from "@/data/courses";

export const metadata: Metadata = {
  title: "Hakkımızda",
  description: "Profect, kaliteli eğitimi herkes için erişilebilir yapmak ve öğrenilen her becerinin sınavla doğrulanmasını sağlamak amacıyla kuruldu.",
};

const fade = "linear-gradient(180deg,#000,transparent)";

export default function AboutPage() {
  return (
    <main>
      <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-divider)" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(to right, color-mix(in srgb,#4a2a9e 8%,transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb,#4a2a9e 8%,transparent) 1px, transparent 1px)", backgroundSize: "72px 72px", WebkitMaskImage: fade, maskImage: fade }} />
        <div aria-hidden data-fx="1" data-py="0.35" data-rot="0.05" data-br="45" style={{ position: "absolute", right: "8%", top: "12%", width: 360, height: 360, border: "1px solid var(--color-accent-300)", transform: "rotate(45deg)" }} />
        <div aria-hidden data-fx="1" data-py="0.15" data-rot="-0.04" data-br="45" style={{ position: "absolute", right: "calc(8% + 70px)", top: "calc(12% + 70px)", width: 220, height: 220, border: "1px dashed var(--color-accent-2-300)", transform: "rotate(45deg)" }} />
        <div aria-hidden data-fx="1" data-py="0.6" data-fl="10" data-br="45" className="brand-diamond" style={{ position: "absolute", right: "calc(8% + 152px)", top: "calc(12% + 152px)", width: 56, height: 56, transform: "rotate(45deg)" }} />
        <div className="wrap" style={{ position: "relative", paddingBlock: "clamp(72px,10vw,150px)" }}>
          <div data-reveal="1" className="eyebrow" style={{ marginBottom: 20 }}>Hakkımızda</div>
          <h1 data-reveal="1" data-delay="100" style={{ fontSize: "clamp(52px,7.4vw,112px)", lineHeight: 0.92, textTransform: "uppercase", margin: "0 0 28px", maxWidth: 900 }}>
            Öğrenmeyi <span style={{ color: "var(--color-accent)" }}>ölçülebilir</span> kılmak için kurduk
          </h1>
          <p data-reveal="1" data-delay="200" style={{ fontSize: 19, maxWidth: 560, color: "color-mix(in srgb,var(--color-text) 74%,transparent)", textWrap: "pretty" }}>
            Profect, kaliteli eğitimi herkes için erişilebilir yapmak ve öğrenilen her becerinin sınavla doğrulanmasını sağlamak amacıyla iki kurucu ortak tarafından hayata geçirildi.
          </p>
        </div>
      </section>

      <section className="wrap" style={{ paddingBlock: "clamp(80px,10vw,140px)", display: "flex", flexDirection: "column", gap: "clamp(80px,10vw,140px)" }}>
        {FOUNDERS.map((f) => (
          <div key={f.n} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))", gap: "clamp(40px,6vw,96px)", alignItems: "center" }}>
            <div data-reveal="1" style={{ order: f.order }}>
              <div className="blueprint" style={{ aspectRatio: "4/5", maxWidth: 460, position: "relative", overflow: "visible" }}>
                <Corners />
                <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                  <div data-fx="1" data-py="0.12" style={{ position: "absolute", inset: "-15% 0" }}>
                    <Image src={f.photo} alt={f.name} fill sizes="(max-width: 520px) 100vw, 460px" style={{ objectFit: "cover" }} />
                  </div>
                </div>
                <div aria-hidden data-fx="1" data-py="-0.2" data-br="45" style={{ position: "absolute", right: -28, bottom: 40, width: 56, height: 56, background: f.color, transform: "rotate(45deg)" }} />
              </div>
            </div>
            <div data-reveal="1" data-delay="150">
              <div aria-hidden style={{ fontFamily: "var(--font-heading)", fontSize: 96, lineHeight: 0.8, fontWeight: 700, color: "transparent", WebkitTextStroke: `1px ${f.color}`, marginBottom: 20 }}>{f.n}</div>
              <div className="card-kicker" style={{ fontSize: 12, color: f.color, marginBottom: 8 }}>{f.role}</div>
              <h2 style={{ fontSize: "clamp(40px,4.6vw,60px)", lineHeight: 1, textTransform: "uppercase", marginBottom: 20 }}>{f.name}</h2>
              <p style={{ fontSize: 17, color: "var(--muted-72)", textWrap: "pretty", marginBottom: 24 }}>{f.bio}</p>
              <blockquote style={{ margin: 0, padding: "4px 0 4px 20px", borderLeft: `1px solid ${f.color}`, fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.25, fontWeight: 500 }}>
                “{f.quote}”
              </blockquote>
              <a href={f.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 15, marginTop: 24 }} aria-label={`${f.name} LinkedIn profili`}>LinkedIn →</a>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

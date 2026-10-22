import type { Metadata } from "next";
import Link from "next/link";
import { Corners } from "@/components/Corners";

export const metadata: Metadata = {
  title: "Sayfa bulunamadı",
  description: "Aradığın sayfa taşınmış veya hiç var olmamış olabilir.",
};

export default function NotFound() {
  return (
    <main>
      <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-divider)" }}>
        <div aria-hidden data-fx="1" data-py="0.35" data-rot="0.05" data-br="45" style={{ position: "absolute", right: "8%", top: "12%", width: 360, height: 360, border: "1px solid var(--color-accent-300)", transform: "rotate(45deg)" }} />
        <div aria-hidden data-fx="1" data-py="0.15" data-rot="-0.04" data-br="45" style={{ position: "absolute", right: "calc(8% + 70px)", top: "calc(12% + 70px)", width: 220, height: 220, border: "1px dashed var(--color-accent-2-300)", transform: "rotate(45deg)" }} />
        <div aria-hidden data-fx="1" data-py="0.6" data-fl="10" data-br="45" className="brand-diamond" style={{ position: "absolute", right: "calc(8% + 152px)", top: "calc(12% + 152px)", width: 56, height: 56, transform: "rotate(45deg)" }} />
        <div className="wrap" style={{ position: "relative", paddingBlock: "clamp(72px,10vw,150px)", minHeight: "min(70vh,640px)" }}>
          <div data-reveal="1" className="eyebrow" style={{ marginBottom: 20 }}>Hata 404</div>
          <div aria-hidden data-reveal="1" data-delay="100" style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(120px,22vw,300px)", lineHeight: 0.8, fontWeight: 700, color: "transparent", WebkitTextStroke: "1px var(--color-accent)", marginBottom: 24 }}>
            404
          </div>
          <h1 data-reveal="1" data-delay="150" style={{ fontSize: "clamp(40px,5.6vw,84px)", lineHeight: 0.95, textTransform: "uppercase", margin: "0 0 24px", maxWidth: 760 }}>
            Bu sayfa <span style={{ color: "var(--color-accent)" }}>bulunamadı</span>
          </h1>
          <p data-reveal="1" data-delay="200" style={{ fontSize: 19, maxWidth: 520, color: "color-mix(in srgb,var(--color-text) 74%,transparent)", textWrap: "pretty", marginBottom: 32 }}>
            Aradığın sayfa taşınmış, silinmiş ya da adres yanlış yazılmış olabilir. Ana sayfaya dönebilir veya kurslara göz atabilirsin.
          </p>
          <div data-reveal="1" data-delay="250" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Link href="/" className="btn btn-primary blueprint">
              <Corners />
              Ana sayfaya dön
            </Link>
            <Link href="/kurslar" className="btn btn-ghost">
              Kursları incele →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

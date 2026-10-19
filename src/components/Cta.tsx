import Link from "next/link";
import { Corners } from "./Corners";

export function Cta() {
  return (
    <section style={{ position: "relative", overflow: "hidden", background: "var(--color-accent-2-900)", color: "#ffffff" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.07) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div
        data-fx="1" data-py="0.3" data-rot="0.06" data-br="45"
        style={{ position: "absolute", right: "10%", top: "50%", width: 280, height: 280, marginTop: -140, border: "1px solid rgba(142,166,243,.6)", transform: "rotate(45deg)" }}
      />
      <div
        data-fx="1" data-py="-0.25" data-br="45"
        style={{ position: "absolute", right: "calc(10% + 112px)", top: "50%", width: 56, height: 56, marginTop: -28, background: "linear-gradient(135deg,#3a5fdc 50%,#8ea6f3 50%)", transform: "rotate(45deg)" }}
      />
      <div className="wrap" style={{ position: "relative", paddingBlock: "clamp(72px,9vw,120px)" }}>
        <h2 data-reveal="1" style={{ fontSize: "clamp(44px,6vw,84px)", lineHeight: 0.95, textTransform: "uppercase", margin: "0 0 20px", maxWidth: 760, color: "#ffffff" }}>
          İlk sertifikan bir kurs uzağında
        </h2>
        <p data-reveal="1" data-delay="100" style={{ fontSize: 18, maxWidth: 480, color: "#ffffff", marginBottom: 32 }}>
          Ücretsiz hesap aç, istediğin kursun ilk modülünü hemen izlemeye başla.
        </p>
        <div data-reveal="1" data-delay="200" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link href="/kurslar" className="btn btn-primary blueprint cta-solid">
            <Corners />
            Kursları incele
          </Link>
        </div>
      </div>
    </section>
  );
}

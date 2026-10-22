import Link from "next/link";
import { ArrowRight, Award } from "lucide-react";
import { Corners } from "@/components/Corners";
import { CourseCard } from "@/components/CourseCard";
import { CertVerify } from "@/components/CertVerify";
import { DEMO_CERT, FOUNDERS, MARQUEE, STEPS, BLUE, PURP, courseColor, courseDelay } from "@/data/courses";
import { listPublishedCourses } from "@/lib/lms";
import Image from "next/image";

// Sertifika üzerindeki sahte QR deseni — tasarımdaki sabit tohumlu üreteçle aynı.
function qrCells() {
  let n = 7;
  return Array.from({ length: 121 }, (_, i) => {
    const x = i % 11;
    const y = Math.floor(i / 11);
    const finder = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
    n = (n * 9301 + 49297) % 233280;
    return finder || n / 233280 > 0.55;
  });
}

export default async function HomePage() {
  const courses = (await listPublishedCourses()).slice(0, 6);
  const marquee = [...MARQUEE, ...MARQUEE].map((t, i) => ({ t, c: i % 2 ? PURP : BLUE }));
  const qr = qrCells();

  return (
    <>
      <main>
        {/* HERO */}
        <section style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid var(--color-divider)" }}>
          <div
            className="wrap"
            style={{
              position: "relative",
              paddingBlock: "clamp(56px,9vw,120px) clamp(64px,8vw,110px)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,460px),1fr))",
              gap: 48,
              alignItems: "center",
            }}
          >
            <div>
              <div data-reveal="1" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
                <span className="diamond brand-diamond" style={{ width: 10, height: 10 }} />
                <span style={{ fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--color-accent-700)", fontWeight: 600 }}>
                  Sınavlı · Sertifikalı · Online
                </span>
              </div>
              <h1 style={{ fontSize: "clamp(60px,8.4vw,124px)", lineHeight: 0.9, letterSpacing: "-.02em", textTransform: "uppercase", margin: "0 0 28px", fontWeight: 700 }}>
                <span data-reveal="1" data-delay="0" style={{ display: "inline-block" }}>Öğren.</span><br />
                <span data-reveal="1" data-delay="120" style={{ display: "inline-block", color: "var(--color-accent)" }}>Sına.</span><br />
                <span data-reveal="1" data-delay="240" style={{ display: "inline-block", color: "var(--color-accent-2)" }}>Belgele.</span>
              </h1>
              <p data-reveal="1" data-delay="360" style={{ fontSize: 19, lineHeight: 1.55, maxWidth: 500, color: "color-mix(in srgb,var(--color-text) 78%,transparent)", textWrap: "pretty", marginBottom: 36 }}>
                Profect’te alanında uzman eğitmenlerin hazırladığı kursları kendi hızında tamamlarsın. Her modülün sonunda sınava girer, final sınavını geçtiğinde doğrulanabilir sertifikanı alırsın.
              </p>
              <div data-reveal="1" data-delay="480" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Link href="/kurslar" className="btn btn-primary blueprint" style={{ fontSize: 18, padding: "14px 26px" }}>
                  <Corners />
                  Kursları Keşfet
                  <ArrowRight size={18} strokeWidth={1.5} />
                </Link>
                <a href="#nasil" className="btn btn-secondary" style={{ fontSize: 18, padding: "14px 26px" }}>Nasıl çalışır?</a>
              </div>
            </div>

            {/* hero composition */}
            <div aria-hidden style={{ position: "relative", height: "clamp(460px,48vw,580px)" }}>
              <div data-fx="1" data-py="0.12" data-rot="0.04" data-br="45" style={{ position: "absolute", left: "50%", top: "50%", width: 340, height: 340, margin: "-170px 0 0 -170px", border: "1px solid var(--color-accent-300)", transform: "rotate(45deg)" }} />
              <div data-fx="1" data-py="0.22" data-rot="-0.06" data-br="45" style={{ position: "absolute", left: "50%", top: "50%", width: 240, height: 240, margin: "-120px 0 0 -120px", border: "1px dashed var(--color-accent-2-300)", transform: "rotate(45deg)" }} />
              <div data-fx="1" data-py="0.4" data-fl="10" data-br="45" className="brand-diamond" style={{ position: "absolute", left: "calc(50% - 30px)", top: "calc(50% - 30px)", width: 60, height: 60, transform: "rotate(45deg)" }} />

              <div data-fx="1" data-py="-0.18" data-fl="8" data-ph="0" style={{ position: "absolute", left: 0, top: "6%", width: "min(300px,70%)" }}>
                <div className="card blueprint elev-md" style={{ background: "#ffffff", padding: 18, gap: 10 }}>
                  <Corners />
                  <div className="card-kicker" style={{ fontSize: 11 }}>Modül 3 / 6</div>
                  <div className="card-title" style={{ fontSize: 20 }}>Veri Analitiğine Giriş</div>
                  <div style={{ height: 6, background: "var(--color-accent-100)", position: "relative" }}>
                    <div style={{ position: "absolute", inset: "0 36% 0 0", background: "var(--color-accent)" }} />
                  </div>
                  <div className="card-meta" style={{ fontSize: 12, justifyContent: "space-between" }}>
                    <span>%64 tamamlandı</span><span>Sıradaki: Pivot tablolar</span>
                  </div>
                </div>
              </div>

              <div data-fx="1" data-py="0.3" data-fl="9" data-ph="2" style={{ position: "absolute", right: 0, top: "38%", width: "min(260px,62%)" }}>
                <div className="card blueprint elev-md" style={{ background: "#ffffff", padding: 18, gap: 8 }}>
                  <Corners />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="card-kicker" style={{ fontSize: 11, color: "var(--color-accent-2)" }}>Final Sınavı</div>
                    <span className="tag tag-accent">Geçti</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 54, lineHeight: 1, fontWeight: 700, color: "var(--color-accent-2)" }}>%95</div>
                  <div className="card-meta" style={{ fontSize: 12 }}>38 / 40 doğru · 52 dk</div>
                </div>
              </div>

              <div data-fx="1" data-py="-0.08" data-fl="7" data-ph="4" style={{ position: "absolute", left: "8%", bottom: "2%", width: "min(290px,68%)" }}>
                <div className="card blueprint elev-md" style={{ background: "#ffffff", padding: "16px 18px", flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Corners />
                  <Award size={34} strokeWidth={1.5} color="#4a2a9e" />
                  <div>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600 }}>Sertifikan hazır</div>
                    <div style={{ fontSize: 12, color: "var(--muted-55)" }}>{DEMO_CERT.number} · Örnek</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <section aria-hidden style={{ overflow: "hidden", borderBottom: "1px solid var(--color-divider)", padding: "18px 0", background: "#ffffff" }}>
          <div data-marquee="1" style={{ display: "flex", width: "max-content", gap: 40, alignItems: "center", fontFamily: "var(--font-heading)", fontSize: 22, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-accent-800)" }}>
            {[...marquee, ...marquee].map((m, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 40, whiteSpace: "nowrap" }}>
                {m.t}
                <span className="diamond" style={{ width: 8, height: 8, background: m.c }} />
              </span>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="nasil" className="wrap section-pad anchor">
          <div data-reveal="1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 64 }}>
            <div>
              <div className="eyebrow">01 — Nasıl çalışır</div>
              <h2 className="h-section" style={{ maxWidth: 720 }}>Kayıttan sertifikaya üç adım</h2>
            </div>
            <p style={{ maxWidth: 380, margin: 0, fontSize: 16, color: "color-mix(in srgb,var(--color-text) 70%,transparent)", textWrap: "pretty" }}>
              Her kurs aynı yapıyı izler: dersler, ölçme ve belgelendirme. Ne öğrendiğini bilirsin, kanıtlayabilirsin.
            </p>
          </div>
          <div style={{ position: "relative" }}>
            <svg aria-hidden viewBox="0 0 1000 20" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, top: 0, width: "100%", height: 20, overflow: "visible" }}>
              <path data-draw="1" d="M0 10 H1000" pathLength="1" fill="none" stroke="#3a5fdc" strokeWidth="1.5" strokeDasharray="1" strokeDashoffset="0" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 32 }}>
              {STEPS.map((s) => (
                <div key={s.n} data-reveal="1" data-delay={s.delay} style={{ paddingTop: 44, position: "relative" }}>
                  <span className="diamond" style={{ position: "absolute", top: 3, left: 0, width: 14, height: 14, background: "#ffffff", border: `1.5px solid ${s.color}` }} />
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 88, lineHeight: 0.85, fontWeight: 700, color: "transparent", WebkitTextStroke: `1px ${s.color}`, marginBottom: 18 }}>{s.n}</div>
                  <h3 style={{ fontSize: 30, textTransform: "uppercase", marginBottom: 12 }}>{s.title}</h3>
                  <p style={{ fontSize: 16, color: "color-mix(in srgb,var(--color-text) 72%,transparent)", textWrap: "pretty", marginBottom: 18 }}>{s.body}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {s.tags.map((t) => <span key={t} className="tag tag-outline" style={{ fontSize: 12 }}>{t}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PARALLAX WORD BAND */}
        <section aria-hidden style={{ position: "relative", overflow: "hidden", padding: "30px 0", borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
          <div data-fx="1" data-pxx="0.5" style={{ whiteSpace: "nowrap", fontFamily: "var(--font-heading)", fontWeight: 700, textTransform: "uppercase", fontSize: "clamp(80px,11vw,170px)", lineHeight: 1, color: "transparent", WebkitTextStroke: "1px var(--color-accent-300)", marginLeft: "-20%" }}>
            Öğren ◆ Sına ◆ Belgele ◆ Öğren ◆ Sına ◆ Belgele
          </div>
          <div data-fx="1" data-pxx="-0.5" style={{ whiteSpace: "nowrap", fontFamily: "var(--font-heading)", fontWeight: 700, textTransform: "uppercase", fontSize: "clamp(80px,11vw,170px)", lineHeight: 1, color: "transparent", WebkitTextStroke: "1px var(--color-accent-2-300)", marginLeft: "-60%" }}>
            Profect ◆ Profect ◆ Profect ◆ Profect ◆ Profect
          </div>
        </section>

        {/* FEATURED COURSES */}
        <section className="wrap section-pad">
          <div data-reveal="1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24, marginBottom: 56 }}>
            <div>
              <div className="eyebrow">02 — Öne çıkan kurslar</div>
              <h2 className="h-section">Kariyerine iş katan programlar</h2>
            </div>
            <Link href="/kurslar" className="btn btn-secondary" style={{ fontSize: 16, padding: "11px 20px" }}>
              Tüm kurslar
              <ArrowRight size={16} strokeWidth={1.5} />
            </Link>
          </div>
          <div className="course-grid">
            {courses.map((c, i) => <CourseCard key={c.id} course={c} color={courseColor(i)} delay={courseDelay(i)} />)}
          </div>
        </section>

        {/* CERTIFICATE */}
        <section id="sertifika" className="anchor" style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--color-divider)", background: "var(--color-surface)" }}>
          <div className="wrap section-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,440px),1fr))", gap: 64, alignItems: "center" }}>
            <div data-reveal="1">
              <div className="eyebrow" style={{ color: "var(--color-accent-2-700)" }}>03 — Sertifikasyon</div>
              <h2 className="h-section" style={{ margin: "0 0 22px" }}>Sınavla kazanılır, tek tıkla doğrulanır</h2>
              <p style={{ fontSize: 17, color: "color-mix(in srgb,var(--color-text) 74%,transparent)", maxWidth: 480, textWrap: "pretty", marginBottom: 32 }}>
                Final sınavını geçen her öğrenciye benzersiz numaralı bir sertifika verilir. İşverenler sertifika numarasıyla ya da QR kodla belgenin geçerliliğini anında kontrol edebilir.
              </p>
              <CertVerify />
            </div>

            <div aria-hidden style={{ position: "relative", minHeight: 440, display: "grid", placeItems: "center" }}>
              <div data-fx="1" data-py="0.15" data-rot="0.03" data-br="45" style={{ position: "absolute", width: 420, height: 420, maxWidth: "100%", border: "1px solid var(--color-accent-2-300)", transform: "rotate(45deg)" }} />
              <div data-fx="1" data-py="-0.1" data-rot="-0.015" data-br="-3" style={{ position: "relative", width: "min(100%,520px)", transform: "rotate(-3deg)" }}>
                <div className="blueprint elev-lg" style={{ background: "#ffffff", padding: 14 }}>
                  <Corners />
                  <div style={{ border: "1px solid var(--color-accent-300)", padding: "34px 34px 28px", position: "relative" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                      <Image src="/profect-logo.jpeg" alt="" width={173} height={47} style={{ height: 30, width: "auto", mixBlendMode: "multiply" }} />
                      <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted-55)", textAlign: "right" }}>No. {DEMO_CERT.number}</div>
                    </div>
                    <div style={{ fontSize: 12, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--color-accent-2)", fontWeight: 600, marginBottom: 8 }}>Başarı Sertifikası</div>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 46, lineHeight: 1, fontWeight: 600, marginBottom: 14 }}>{DEMO_CERT.holder}</div>
                    <p style={{ fontSize: 14, color: "var(--muted-72)", marginBottom: 26, textWrap: "pretty" }}>
                      {DEMO_CERT.course} programını tamamlamış ve final sınavını %92 başarıyla geçmiştir.
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,auto)", gap: "6px 28px", fontSize: 12 }}>
                        <span style={{ color: "color-mix(in srgb,var(--color-text) 50%,transparent)" }}>Tarih</span>
                        <span style={{ color: "color-mix(in srgb,var(--color-text) 50%,transparent)" }}>Süre</span>
                        <span style={{ fontWeight: 600 }}>{DEMO_CERT.date}</span>
                        <span style={{ fontWeight: 600 }}>24 saat</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(11,6px)", gap: 1, padding: 6, border: "1px solid var(--color-divider)" }}>
                        {qr.map((on, i) => <span key={i} style={{ width: 6, height: 6, background: on ? "#17142b" : "transparent" }} />)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FOUNDERS TEASER */}
        <section className="wrap section-pad">
          <div data-reveal="1" style={{ marginBottom: 56 }}>
            <div className="eyebrow">04 — Kurucular</div>
            <h2 className="h-section" style={{ maxWidth: 820 }}>İki kurucu, tek hedef: ölçülebilir öğrenme</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 40 }}>
            {FOUNDERS.map((f, i) => (
              <div key={f.n} data-reveal="1" data-delay={i * 150} className="founder-row">
                <div className="blueprint" style={{ aspectRatio: "4/5", overflow: "visible" }}>
                  <Corners />
                  <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                    <Image src={f.photo} alt={f.name} fill sizes="(max-width: 520px) 100vw, 160px" style={{ objectFit: "cover" }} />
                  </div>
                </div>
                <div>
                  <div className="card-kicker" style={{ fontSize: 11, color: f.color, marginBottom: 6 }}>{f.role}</div>
                  <h3 style={{ fontSize: 32, textTransform: "uppercase", marginBottom: 10 }}>{f.name}</h3>
                  <p style={{ fontSize: 15, color: "var(--muted-72)", textWrap: "pretty" }}>{f.short}</p>
                  <Link href="/hakkimizda" className="btn btn-ghost" style={{ fontSize: 15 }}>Hikâyemizi oku →</Link>
                  <a href={f.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 15 }} aria-label={`${f.name} LinkedIn profili`}>LinkedIn →</a>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

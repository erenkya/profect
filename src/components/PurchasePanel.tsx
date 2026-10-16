"use client";

import { useEffect, useId, useState } from "react";
import { Corners } from "./Corners";
import { BLUE, PLUS_PRICE, PURP } from "@/data/courses";

type Step = "plan" | "pay" | "done";
type Plan = "single" | "plus";

type Props = {
  title: string;
  price: string;
  oldPrice: string;
  includes: string[];
};

const fieldStyle = { background: "#ffffff", fontSize: 15, minHeight: 42 } as const;

export function PurchasePanel({ title, price, oldPrice, includes }: Props) {
  const [step, setStep] = useState<Step | null>(null);
  const [plan, setPlan] = useState<Plan>("single");
  const titleId = useId();

  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStep(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [step]);

  const summary = plan === "plus" ? { label: "Profect Plus · aylık", price: PLUS_PRICE } : { label: title, price };
  const stepIdx = step ? { plan: 0, pay: 1, done: 2 }[step] : 0;
  const plans: { id: Plan; t: string; d: string; price: string }[] = [
    { id: "single", t: "Yalnızca bu kurs", d: "Ömür boyu erişim · 1 sertifika", price },
    { id: "plus", t: "Profect Plus", d: "Tüm kurslar · sınırsız sertifika · aylık", price: `${PLUS_PRICE}/ay` },
  ];

  return (
    <>
      <aside style={{ position: "sticky", top: 96, minWidth: 0 }}>
        <div className="card blueprint elev-lg" style={{ background: "#ffffff", padding: 28, gap: 16 }}>
          <Corners />
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 52, lineHeight: 1, fontWeight: 700, color: "var(--color-accent-2)" }}>{price}</span>
            <span style={{ fontSize: 15, textDecoration: "line-through", color: "color-mix(in srgb,var(--color-text) 45%,transparent)" }}>{oldPrice}</span>
          </div>
          <button className="btn btn-primary blueprint btn-block" onClick={() => setStep("plan")} style={{ fontSize: 19, padding: 15, marginTop: 0 }}>
            <Corners />
            Satın Al ve Başla
          </button>
          <button className="btn btn-secondary btn-block" style={{ fontSize: 16, padding: 12, marginTop: 0 }}>
            İlk modülü ücretsiz izle
          </button>
          <div style={{ fontSize: 13, textAlign: "center", color: "var(--muted-55)" }}>14 gün içinde koşulsuz iade</div>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12, fontSize: 15 }}>
            {includes.map((t) => (
              <div key={t} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="diamond" style={{ width: 8, height: 8, border: "1.5px solid var(--color-accent)", flex: "none" }} />
                {t}
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 16, fontSize: 14 }}>
            <strong style={{ fontWeight: 600, color: "var(--color-accent-2-700)" }}>Profect Plus</strong> ile tüm kurslara ve sertifikalara aylık {PLUS_PRICE}’dan erişebilirsin.
          </div>
        </div>
      </aside>

      {step && (
        <div
          className="dialog-backdrop"
          data-lenis-prevent
          onClick={() => setStep(null)}
          style={{ zIndex: 100, background: "color-mix(in srgb,#1d0f45 55%,transparent)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="dialog blueprint"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(560px,100%)", background: "#ffffff", padding: 32, gap: 20, boxShadow: "var(--shadow-lg)", maxHeight: "100%", overflowY: "auto" }}
          >
            <Corners />
            <div style={{ display: "flex", gap: 8 }} aria-hidden>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ flex: 1, height: 3, background: i <= stepIdx ? (i === 2 ? PURP : BLUE) : "var(--color-divider)", transition: "background .4s" }} />
              ))}
            </div>

            {step === "plan" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div id={titleId} className="dialog-title" style={{ fontSize: 30, textTransform: "uppercase" }}>Planını seç</div>
                <div role="radiogroup" aria-labelledby={titleId} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {plans.map((p) => (
                    <button key={p.id} type="button" role="radio" aria-checked={plan === p.id} className="plan-opt blueprint" onClick={() => setPlan(p.id)}>
                      <span className="plan-dot" />
                      <span>
                        <span style={{ display: "block", fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600 }}>{p.t}</span>
                        <span style={{ display: "block", fontSize: 13, color: "color-mix(in srgb,var(--color-text) 60%,transparent)" }}>{p.d}</span>
                      </span>
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, color: "var(--color-accent-2)" }}>{p.price}</span>
                    </button>
                  ))}
                </div>
                <div className="dialog-actions">
                  <button className="btn btn-secondary" onClick={() => setStep(null)} style={{ fontSize: 16, padding: "10px 18px" }}>Vazgeç</button>
                  <button className="btn btn-primary blueprint" onClick={() => setStep("pay")} style={{ fontSize: 16, padding: "10px 22px" }}>
                    <Corners />
                    Devam et
                  </button>
                </div>
              </div>
            )}

            {step === "pay" && (
              <form
                style={{ display: "flex", flexDirection: "column", gap: 14 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  setStep("done");
                }}
              >
                <div id={titleId} className="dialog-title" style={{ fontSize: 30, textTransform: "uppercase" }}>Ödeme</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, padding: "12px 0", borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
                  <span>{summary.label}</span>
                  <strong style={{ fontWeight: 600 }}>{summary.price}</strong>
                </div>
                <div className="field"><label htmlFor="ck-name">Kart üzerindeki isim</label><input id="ck-name" className="input" placeholder="Ad Soyad" autoComplete="cc-name" style={fieldStyle} /></div>
                <div className="field"><label htmlFor="ck-no">Kart numarası</label><input id="ck-no" className="input" placeholder="0000 0000 0000 0000" inputMode="numeric" autoComplete="cc-number" style={fieldStyle} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="field"><label htmlFor="ck-exp">Son kullanma</label><input id="ck-exp" className="input" placeholder="AA/YY" autoComplete="cc-exp" style={fieldStyle} /></div>
                  <div className="field"><label htmlFor="ck-cvc">CVC</label><input id="ck-cvc" className="input" placeholder="000" inputMode="numeric" autoComplete="cc-csc" style={fieldStyle} /></div>
                </div>
                <div className="dialog-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setStep("plan")} style={{ fontSize: 16, padding: "10px 18px" }}>Geri</button>
                  <button type="submit" className="btn btn-primary blueprint" style={{ fontSize: 16, padding: "10px 22px" }}>
                    <Corners />
                    {summary.price} öde
                  </button>
                </div>
              </form>
            )}

            {step === "done" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
                <span className="diamond brand-diamond" style={{ width: 44, height: 44, margin: "10px 0 10px 8px" }} />
                <div id={titleId} className="dialog-title" style={{ fontSize: 30, textTransform: "uppercase" }}>Kaydın tamamlandı</div>
                <p style={{ fontSize: 15, color: "var(--muted-72)", margin: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{title}</strong> kursuna erişimin açıldı. Modül 1 seni bekliyor; final sınavını geçtiğinde sertifikan hesabına eklenecek.
                </p>
                <button className="btn btn-primary blueprint btn-block" onClick={() => setStep(null)} style={{ fontSize: 17, padding: 13 }}>
                  <Corners />
                  Derse başla
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useRef } from "react";
import { CARD_BRAND_ICON, CARD_BRAND_LABEL, detectCardBrand, isValidExpiry, type CardBrand } from "@/lib/card-brand";
import { luhn } from "@/lib/checkout-schema";
import "./card-preview.css";

export type CardField = "number" | "name" | "expiry" | "cvv";

const BG: (CardBrand | "none")[] = ["none", "visa", "mastercard", "amex", "troy"];

/** Kart yüzü arka planı: marka katmanları üst üste durur, aktif olanın opaklığı animasyonla açılır. */
function Backgrounds() {
  return (
    <>
      {BG.map((b) => (
        <span key={b} className="cc-bg" data-b={b} />
      ))}
    </>
  );
}

/**
 * Temsili kredi kartı: numara / isim / son kullanma yazıldıkça dolar, CVC alanına odaklanınca arka yüze döner,
 * marka tanınınca renk ve logo değişir, imleçle eğilir. Yalnızca görseldir; hiçbir veri buradan çıkmaz.
 */
export function CardPreview({ number, name, expiry, cvv, focus }: { number: string; name: string; expiry: string; cvv: string; focus: CardField | null }) {
  const stage = useRef<HTMLDivElement>(null);
  const brand = detectCardBrand(number);
  const digits = number.replace(/\D/g, "");
  const numberOk = digits.length >= 15 && luhn(digits) && (brand === "amex" ? digits.length === 15 : digits.length >= 16);
  const expiryBad = expiry.length === 5 && !isValidExpiry(expiry);
  const valid = numberOk && isValidExpiry(expiry);
  const flipped = focus === "cvv";

  const pattern = brand === "amex" ? "#### ###### #####" : "#### #### #### ####";
  let di = 0;
  const numberChars = [...pattern].map((ch) => (ch === "#" ? (digits[di++] ?? null) : " "));

  const nameText = name.trim().toLocaleUpperCase("tr-TR").slice(0, 22);
  const expTpl = "AA/YY";
  const cvvLen = brand === "amex" ? 4 : 3;

  function move(e: React.PointerEvent) {
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(x - 0.5) * 22}deg`);
    el.style.setProperty("--rx", `${(0.5 - y) * 18}deg`);
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
  }
  function leave() {
    const el = stage.current;
    if (!el) return;
    ["--rx", "--ry", "--gx", "--gy"].forEach((k) => el.style.removeProperty(k));
  }

  const icon = brand ? CARD_BRAND_ICON[brand] : null;

  return (
    <div ref={stage} className="cc-stage" aria-hidden="true" data-brand={brand ?? "none"} data-valid={valid} data-focus={focus ?? ""} onPointerMove={move} onPointerLeave={leave}>
      <div className="cc-shadow">
      <div className="cc-scene">
        <div className="cc-float">
          <div className="cc-tilt">
            <div className={`cc-flip${flipped ? " is-flipped" : ""}`}>
              {/* ön yüz */}
              <div className="cc-face cc-front">
                <Backgrounds />
                <span className="cc-shine" />
                <span className="cc-glare" />
                <span key={digits.length} className="cc-pulse" />
                <div className="cc-top">
                  <span className="cc-chip" />
                  <svg className="cc-nfc" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7 8a6 6 0 0 1 0 8M11 5.5a10 10 0 0 1 0 13M15 3a14 14 0 0 1 0 18" /></svg>
                  <span key={brand ?? "none"} className="cc-logo">{icon && <img src={icon.src} width={icon.w} height={icon.h} alt="" />}</span>
                </div>
                <div className="cc-number" data-active={focus === "number"}>
                  {numberChars.map((c, i) =>
                    c === " " ? <span key={i} className="cc-gap" /> : c === null ? <span key={`${i}e`} className="cc-ch is-empty">•</span> : <span key={`${i}${c}`} className="cc-ch is-typed">{c}</span>,
                  )}
                </div>
                <div className="cc-bottom">
                  <div className="cc-field cc-name" data-active={focus === "name"}>
                    <small>KART SAHİBİ</small>
                    <span className="cc-name-text">
                      {nameText ? [...nameText].map((c, i) => <span key={`${i}${c}`} className="cc-ch2 is-typed">{c === " " ? " " : c}</span>) : <span className="is-empty">AD SOYAD</span>}
                    </span>
                  </div>
                  <div className="cc-field cc-exp" data-active={focus === "expiry"} data-bad={expiryBad}>
                    <small>SON KULLANMA</small>
                    <span className="cc-exp-text">
                      {[...expTpl].map((t, i) => (expiry[i] ? <span key={`${i}${expiry[i]}`} className="cc-ch2 is-typed">{expiry[i]}</span> : <span key={`${i}t`} className="is-empty">{t}</span>))}
                    </span>
                  </div>
                </div>
              </div>
              {/* arka yüz */}
              <div className="cc-face cc-back">
                <Backgrounds />
                <span className="cc-glare" />
                <span className="cc-stripe" />
                <div className="cc-sign">
                  <small>CVC</small>
                  <span className="cc-cvv" data-active={focus === "cvv"}>
                    {Array.from({ length: cvvLen }, (_, i) => (cvv[i] ? <span key={`${i}${cvv[i]}`} className="cc-ch2 is-typed">{cvv[i]}</span> : <span key={`${i}e`} className="is-empty">•</span>))}
                  </span>
                </div>
                <span className="cc-back-note">Bu kart yalnızca örnektir.</span>
                {icon && <span className="cc-logo cc-logo-back"><img src={icon.src} width={icon.w} height={icon.h} alt="" /></span>}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
      <div className="cc-caption">
        <span key={expiryBad ? "bad" : valid ? "ok" : (brand ?? "none")} className="cc-caption-in" data-ok={valid} data-bad={expiryBad}>
          {expiryBad ? "Son kullanma tarihi geçmiş ya da geçersiz" : valid ? "✓ Kart numarası ve tarih geçerli görünüyor" : brand ? CARD_BRAND_LABEL[brand] : ""}
        </span>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import "@/components/checkout/checkout.css";
import { Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { removeFromCart } from "@/lib/cart";
import { JoinProgramButton } from "@/components/JoinProgramButton";
import type { QuoteLine } from "@/lib/cart-quote";

const NOTE = {
  course: { owned: "Bu kursa zaten erişimin var; siparişe eklenmez.", unavailable: "Bu kurs artık satışta değil; siparişe eklenmez.", covered: "Programa dahil; ayrıca ödenmez.", join: "", ok: "" },
  program: { owned: "Bu programa zaten üyesin; siparişe eklenmez.", unavailable: "Bu program artık satışta değil; siparişe eklenmez.", covered: "", join: "Tüm kursların sende; programa ücretsiz katılabilirsin.", ok: "" },
} as const;

/** Sepet / ödeme sayfalarının ortak kalem listesi. `editable` ise satır silinebilir. */
export function CartLines({ lines, editable }: { lines: QuoteLine[]; editable?: boolean }) {
  return (
    <ul className="cart-lines" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {lines.map((l) => (
        <li key={l.key} className="cart-line" data-status={l.status}>
          <div className="cart-thumb" aria-hidden>
            {l.cover ? <img src={l.cover} alt="" loading="lazy" /> : <span className="diamond" style={{ width: 22, height: 22, background: l.item.type === "course" ? "var(--color-accent)" : "var(--color-accent-2)" }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="cart-title">
              {l.status !== "unavailable" ? <Link href={`/${l.item.type === "program" ? "programlar" : "kurslar"}/${l.item.slug}`}>{l.title}</Link> : l.title}
            </div>
            <div className="cart-sub">{l.subtitle}</div>
            {l.item.type === "program" && l.status === "join" && !l.joinable ? (
              // Tutar 0 ama kurslar sepetteki başka bir programdan "edinilmiş" sayılıyor: gerçek sahiplik yok, katılım butonu gösterilmez.
              <div className="cart-note">Kursların bir kısmı sepetindeki başka bir programla geliyor; o programı satın aldıktan sonra buradan ücretsiz katılabilirsin.</div>
            ) : (
              NOTE[l.item.type][l.status] && <div className="cart-note">{NOTE[l.item.type][l.status]}</div>
            )}
            {editable && l.item.type === "program" && l.status === "join" && l.joinable && (
              <div style={{ marginTop: 8 }}>
                <JoinProgramButton slug={l.item.slug} onJoined={() => removeFromCart(l.item)} />
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            {l.status === "ok" && (
              <>
                <div className="cart-price">{formatPrice(l.price)}</div>
                {l.oldPrice != null && l.oldPrice > l.price && <div className="cart-old">{formatPrice(l.oldPrice)}</div>}
              </>
            )}
            {l.status === "join" && <div className="cart-price">Ücretsiz</div>}
          </div>
          {editable && (
            <button type="button" className="btn btn-secondary btn-icon" aria-label={`${l.title} sepetten çıkar`} onClick={() => removeFromCart(l.item)}>
              <Trash2 size={16} aria-hidden />
            </button>
          )}
          {l.children && l.children.length > 0 && (
            <ul className="cart-children" aria-label={`${l.title} kursları`}>
              {l.children.map((c, i) => (
                <li key={i} className="cart-child" data-owned={c.owned || undefined}>
                  <span className="cart-child-title">{c.title}</span>
                  {c.owned ? (
                    <span className="cart-child-owned">Zaten sende</span>
                  ) : (
                    <span className="cart-child-price">
                      {c.price < c.listPrice && <span className="cart-old">{formatPrice(c.listPrice)}</span>} {formatPrice(c.price)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

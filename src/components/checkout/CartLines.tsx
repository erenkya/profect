"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { removeFromCart } from "@/lib/cart";
import type { QuoteLine } from "@/lib/cart-quote";

const NOTE = { owned: "Bu kursa zaten erişimin var; siparişe eklenmez.", unavailable: "Bu kurs artık satışta değil; siparişe eklenmez.", ok: "" } as const;

/** Sepet / ödeme sayfalarının ortak kalem listesi. `editable` ise satır silinebilir. */
export function CartLines({ lines, editable }: { lines: QuoteLine[]; editable?: boolean }) {
  return (
    <ul className="cart-lines" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {lines.map((l) => (
        <li key={l.key} className="cart-line" data-status={l.status}>
          <div className="cart-thumb" aria-hidden>
            {l.cover ? <img src={l.cover} alt="" loading="lazy" /> : <span className="diamond" style={{ width: 22, height: 22, background: l.item.type === "plus" ? "var(--color-accent-2)" : "var(--color-accent)" }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="cart-title">
              {l.item.type === "course" && l.status !== "unavailable" ? <Link href={`/kurslar/${l.item.slug}`}>{l.title}</Link> : l.title}
            </div>
            <div className="cart-sub">{l.subtitle}</div>
            {l.status !== "ok" && <div className="cart-note">{NOTE[l.status]}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            {l.status === "ok" && (
              <>
                <div className="cart-price">{formatPrice(l.price)}</div>
                {l.oldPrice && <div className="cart-old">{formatPrice(l.oldPrice)}</div>}
              </>
            )}
          </div>
          {editable && (
            <button type="button" className="btn btn-secondary btn-icon" aria-label={`${l.title} sepetten çıkar`} onClick={() => removeFromCart(l.item)}>
              <Trash2 size={16} aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

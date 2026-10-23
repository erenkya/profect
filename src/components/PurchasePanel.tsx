"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ShoppingCart } from "lucide-react";
import { Corners } from "./Corners";
import { addToCart, useCart } from "@/lib/cart";

type Props = {
  slug: string;
  priceLabel: string;
  oldPriceLabel: string | null;
  plusPriceLabel: string;
  includes: string[];
  loggedIn: boolean;
  hasAccess: boolean;
};

const big = { fontSize: 19, padding: 15, marginTop: 0 } as const;

export function PurchasePanel({ slug, priceLabel, oldPriceLabel, plusPriceLabel, includes, loggedIn, hasAccess }: Props) {
  const router = useRouter();
  const { items, ready } = useCart();
  const inCart = ready && items.some((i) => i.type === "course" && i.slug === slug);
  const plusInCart = ready && items.some((i) => i.type === "plus");

  function buyNow() {
    addToCart({ type: "course", slug });
    router.push(loggedIn ? "/odeme" : `/giris?next=${encodeURIComponent("/odeme")}`);
  }

  return (
    <aside style={{ position: "sticky", top: 96, minWidth: 0 }}>
      <div className="card blueprint elev-lg" style={{ background: "#ffffff", padding: 28, gap: 16 }}>
        <Corners />
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 52, lineHeight: 1, fontWeight: 700, color: "var(--color-accent-2)" }}>{priceLabel}</span>
          {oldPriceLabel && <span style={{ fontSize: 15, textDecoration: "line-through", color: "color-mix(in srgb,var(--color-text) 45%,transparent)" }}>{oldPriceLabel}</span>}
        </div>

        {hasAccess ? (
          <Link href={`/ogrenim/${slug}`} className="btn btn-primary blueprint btn-block" style={big}>
            <Corners />
            Derse Git
          </Link>
        ) : (
          <>
            <button type="button" className="btn btn-primary blueprint btn-block" onClick={buyNow} style={big}>
              <Corners />
              Hemen Satın Al
            </button>
            {inCart ? (
              <Link href="/sepet" className="btn btn-secondary btn-block" style={{ marginTop: 0 }}>
                <Check size={16} aria-hidden /> Sepette · Sepete git
              </Link>
            ) : (
              <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 0 }} onClick={() => addToCart({ type: "course", slug })}>
                <ShoppingCart size={16} aria-hidden /> Sepete Ekle
              </button>
            )}
          </>
        )}

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
          <strong style={{ fontWeight: 600, color: "var(--color-accent-2-700)" }}>Profect Plus</strong> ile tüm kurslara ve sertifikalara aylık {plusPriceLabel}’dan erişebilirsin.{" "}
          {plusInCart ? (
            <Link href="/sepet">Sepette →</Link>
          ) : (
            <button type="button" onClick={() => addToCart({ type: "plus" })} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline", color: "var(--color-accent-600)" }}>
              Plus’ı sepete ekle
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

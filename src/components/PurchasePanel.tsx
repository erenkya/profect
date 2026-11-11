"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Gift, ShoppingCart } from "lucide-react";
import { Corners } from "./Corners";
import { addToCart, useCart } from "@/lib/cart";
import { RequestCourseButton } from "@/components/company/RequestCourseButton";
import { formatIstanbul } from "@/lib/due-rules";
import { formatPrice } from "@/lib/format";

type Props = {
  slug: string;
  courseId: number;
  priceLabel: string;
  oldPriceLabel: string | null;
  includes: string[];
  loggedIn: boolean;
  hasAccess: boolean;
  giftable?: boolean;
  /** Şirkete bağlı (onaylı) üye: satın almanın yanında şirketinden de talep edebilir. */
  companyMember?: boolean;
  /** Şirketin verdiği eğitim süresi (UTC) dolduğu için erişimi kapanmış kullanıcı: talep yerine açıklama gösterilir. */
  expiredAt?: string | null;
};

const big = { fontSize: 19, padding: 15, marginTop: 0 } as const;

export function PurchasePanel({ slug, courseId, priceLabel, oldPriceLabel, includes, loggedIn, hasAccess, giftable = true, companyMember = false, expiredAt = null }: Props) {
  const router = useRouter();
  const { items, ready } = useCart();
  const inCart = ready && items.some((i) => i.type === "course" && i.slug === slug);

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
        {priceLabel !== formatPrice(0) && <div style={{ fontSize: 13, color: "var(--muted-55)", marginTop: -8 }}>KDV dahil değildir; ödeme adımında eklenir.</div>}

        {hasAccess ? (
          <Link href={`/ogrenim/${slug}`} className="btn btn-primary blueprint btn-block" style={big}>
            <Corners />
            Derse Git
          </Link>
        ) : expiredAt ? (
          <div role="status" style={{ padding: "12px 14px", border: "1px solid var(--color-accent-2-300)", background: "var(--color-accent-2-100)", fontSize: 14 }}>
            Bu eğitimin süresi <strong>{formatIstanbul(expiredAt)}</strong> tarihinde doldu ve erişimin kapandı. Devam etmek için şirket yöneticinden süreyi uzatmasını iste.
          </div>
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
            {companyMember && <RequestCourseButton courseId={courseId} className="btn btn-secondary btn-block" style={{ marginTop: 0 }} />}
          </>
        )}

        {giftable && (
          <Link href={loggedIn ? `/hediye-et/${slug}` : `/giris?next=${encodeURIComponent(`/hediye-et/${slug}`)}`} className="btn btn-secondary btn-block" style={{ marginTop: 0 }}>
            <Gift size={16} aria-hidden /> Hediye Et
          </Link>
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
      </div>
    </aside>
  );
}

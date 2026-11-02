"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Gift, ShoppingCart } from "lucide-react";
import { addToCart, useCart } from "@/lib/cart";

type Props = { slug: string; loggedIn: boolean; hasAccess: boolean; giftable?: boolean };

const btn = { fontSize: 15, padding: "10px 8px", marginTop: 0, whiteSpace: "nowrap" } as const;

export function CourseCardActions({ slug, loggedIn, hasAccess, giftable = true }: Props) {
  const router = useRouter();
  const { items, ready } = useCart();
  const inCart = ready && items.some((i) => i.type === "course" && i.slug === slug);

  function buyNow() {
    addToCart({ type: "course", slug });
    router.push(loggedIn ? "/odeme" : `/giris?next=${encodeURIComponent("/odeme")}`);
  }

  const giftHref = `/hediye-et/${slug}`;
  const giftLink = giftable && (
    <Link href={loggedIn ? giftHref : `/giris?next=${encodeURIComponent(giftHref)}`} className="btn btn-secondary btn-block" style={{ ...btn, gridColumn: "1 / -1" }}>
      <Gift size={15} aria-hidden /> Hediye Et
    </Link>
  );

  if (hasAccess) {
    return (
      <div className="course-actions" style={{ display: "grid", gap: 10 }}>
        <Link href={`/ogrenim/${slug}`} className="btn btn-primary btn-block" style={btn}>Derse Git</Link>
        {giftLink}
      </div>
    );
  }

  return (
    <div className="course-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {inCart ? (
        <Link href="/sepet" className="btn btn-secondary btn-block" style={btn}>
          <Check size={15} aria-hidden /> Sepette
        </Link>
      ) : (
        <button type="button" className="btn btn-secondary btn-block" style={btn} onClick={() => addToCart({ type: "course", slug })}>
          <ShoppingCart size={15} aria-hidden /> Sepete Ekle
        </button>
      )}
      <button type="button" className="btn btn-primary btn-block" style={btn} onClick={buyNow}>
        Hemen Satın Al
      </button>
      {giftLink}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ShoppingCart } from "lucide-react";
import { addToCart, useCart } from "@/lib/cart";

type Props = { slug: string; loggedIn: boolean; hasAccess: boolean };

const btn = { fontSize: 15, padding: "10px 8px", marginTop: 0, whiteSpace: "nowrap" } as const;

export function CourseCardActions({ slug, loggedIn, hasAccess }: Props) {
  const router = useRouter();
  const { items, ready } = useCart();
  const inCart = ready && items.some((i) => i.type === "course" && i.slug === slug);

  function buyNow() {
    addToCart({ type: "course", slug });
    router.push(loggedIn ? "/odeme" : `/giris?next=${encodeURIComponent("/odeme")}`);
  }

  if (hasAccess) {
    return (
      <div className="course-actions">
        <Link href={`/ogrenim/${slug}`} className="btn btn-primary btn-block" style={btn}>Derse Git</Link>
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
    </div>
  );
}

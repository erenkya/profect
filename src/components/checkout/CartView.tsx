"use client";

import Link from "next/link";
import { Corners } from "@/components/Corners";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { CartLines } from "./CartLines";
import { useQuote } from "./useQuote";

export function CartView() {
  const { items, ready } = useCart();
  const q = useQuote(items, ready);

  if (!ready || q.loading) return <p style={{ color: "var(--muted-72)" }} aria-live="polite">Sepetin yükleniyor…</p>;

  if (items.length === 0) {
    return (
      <div className="card blueprint" style={{ background: "#fff", padding: 32, gap: 14, alignItems: "flex-start" }}>
        <Corners />
        <div className="dialog-title" style={{ fontSize: 26, textTransform: "uppercase" }}>Sepetin boş</div>
        <p style={{ margin: 0, color: "var(--muted-72)" }}>Kurslara göz at, beğendiklerini sepete ekle.</p>
        <Link href="/kurslar" className="btn btn-primary blueprint"><Corners />Kursları keşfet</Link>
      </div>
    );
  }
  if (q.failed) return <p role="alert" style={{ color: "var(--color-accent-2-700)" }}>Sepet yüklenemedi. Sayfayı yenileyip tekrar dene.</p>;

  const checkoutHref = "/odeme";
  return (
    <div className="checkout-grid">
      <div className="card blueprint" style={{ background: "#fff", padding: "8px 24px" }}>
        <Corners />
        <CartLines lines={q.lines} editable />
      </div>
      <aside className="card blueprint elev-md checkout-summary" style={{ background: "#fff", padding: 24, gap: 14 }}>
        <Corners />
        <div className="dialog-title" style={{ fontSize: 24, textTransform: "uppercase" }}>Sipariş özeti</div>
        <div className="sum-row"><span>Ürün sayısı</span><span>{q.payable.length}</span></div>
        <div className="sum-row sum-total"><span>Toplam (KDV dahil)</span><span>{formatPrice(q.total)}</span></div>
        {q.payable.length > 0 ? (
          <Link href={q.loggedIn ? checkoutHref : `/giris?next=${encodeURIComponent(checkoutHref)}`} className="btn btn-primary blueprint btn-block" style={{ fontSize: 18, padding: 14 }}>
            <Corners />
            {q.loggedIn ? "Ödemeye geç" : "Giriş yap ve ödemeye geç"}
          </Link>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted-72)" }}>Sepetindeki ürünlerin hiçbiri satın alınabilir durumda değil.</p>
        )}
        <Link href="/kurslar" style={{ fontSize: 14, textAlign: "center" }}>Alışverişe devam et</Link>
      </aside>
    </div>
  );
}

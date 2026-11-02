"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Gift, ShoppingCart } from "lucide-react";
import { Corners } from "./Corners";
import { JoinProgramButton } from "./JoinProgramButton";
import { addToCart, useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";

type Props = {
  slug: string;
  loggedIn: boolean;
  /** Kullanıcı programa üye mi. */
  member: boolean;
  /** Tüm kurslar yayında ve final sınavlı: satışa açık. */
  sellable: boolean;
  /** Kişiye özel ödenecek tutar (girişsizde B'). */
  payable: number;
  /** Programın geçerli fiyatı (B' = min(B, S)). */
  programPrice: number;
  /** S: kursların ayrı ayrı liste fiyatı toplamı. */
  listTotal: number;
  ownedCount: number;
  ownedCredit: number;
  /** Ödenecek tutar 0 ve tüm kurslar gerçekten edinilmiş: ücretsiz katılım (sunucu da aynısını doğrular). */
  joinable?: boolean;
  /** Üye için ilerleme özeti ("3/5 kurs") ve varsa program sertifikası. */
  progress?: { completed: number; total: number; certificateCode: string | null };
};

const big = { fontSize: 19, padding: 15, marginTop: 0 } as const;

export function ProgramPricePanel({ slug, loggedIn, member, sellable, payable, programPrice, listTotal, ownedCount, ownedCredit, joinable = false, progress }: Props) {
  const router = useRouter();
  const { items, ready } = useCart();
  const inCart = ready && items.some((i) => i.type === "program" && i.slug === slug);
  const giftHref = `/hediye-et/program/${slug}`;

  function buyNow() {
    addToCart({ type: "program", slug });
    router.push(loggedIn ? "/odeme" : `/giris?next=${encodeURIComponent("/odeme")}`);
  }

  return (
    <aside style={{ position: "sticky", top: 96, minWidth: 0 }}>
      <div className="card blueprint elev-lg" style={{ background: "#ffffff", padding: 28, gap: 16 }}>
        <Corners />
        {member ? (
          <>
            <div className="card-kicker" style={{ fontSize: 11 }}>Bu programa üyesin</div>
            {progress && (
              <>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 44, lineHeight: 1, fontWeight: 700, color: "var(--color-accent-2)" }}>{progress.completed}/{progress.total} kurs</div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}%` }} /></div>
              </>
            )}
            <Link href="/hesabim/programlarim" className="btn btn-primary blueprint btn-block" style={big}>
              <Corners />
              Programa git
            </Link>
            {progress?.certificateCode && (
              <Link href={`/sertifika/${progress.certificateCode}`} className="btn btn-secondary btn-block" style={{ marginTop: 0 }}>Program sertifikamı gör</Link>
            )}
          </>
        ) : !sellable ? (
          <>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, lineHeight: 1.1, fontWeight: 700 }}>Şu an satışta değil</div>
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted-72)" }}>Bu program geçici olarak satışa kapalı. Daha sonra tekrar kontrol edebilirsin.</p>
          </>
        ) : (
          <>
            <div className="prog-sum" style={{ borderTop: 0, paddingTop: 0 }}>
              <div className="prog-sum-row"><span>Ayrı ayrı alsan</span><span style={{ textDecoration: listTotal > programPrice ? "line-through" : undefined, color: "var(--muted-55)" }}>{formatPrice(listTotal)}</span></div>
              <div className="prog-sum-row"><span>Program fiyatı</span><strong style={{ fontWeight: 600 }}>{formatPrice(programPrice)}</strong></div>
              {ownedCount > 0 && (
                <div className="prog-sum-row" style={{ color: "var(--color-accent-2-700)" }}><span>Sahip olduğun {ownedCount} kurs</span><span>−{formatPrice(ownedCredit)}</span></div>
              )}
              <div className="prog-sum-total">
                <span style={{ fontSize: 15 }}>Ödeyeceğin tutar</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 48, lineHeight: 1, fontWeight: 700, color: "var(--color-accent-2)" }}>{formatPrice(payable)}</span>
              </div>
            </div>

            {joinable ? (
              <>
                <p style={{ margin: 0, fontSize: 14, color: "var(--muted-72)" }}>Programın tüm kurslarına zaten sahipsin; ücretsiz katılabilirsin.</p>
                <JoinProgramButton slug={slug} />
              </>
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
                  <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 0 }} onClick={() => addToCart({ type: "program", slug })}>
                    <ShoppingCart size={16} aria-hidden /> Sepete Ekle
                  </button>
                )}
              </>
            )}
          </>
        )}

        {sellable && programPrice > 0 && (
          <Link href={loggedIn ? giftHref : `/giris?next=${encodeURIComponent(giftHref)}`} className="btn btn-secondary btn-block" style={{ marginTop: 0 }}>
            <Gift size={16} aria-hidden /> Hediye Et
          </Link>
        )}
        {!member && sellable && !joinable && <div style={{ fontSize: 13, textAlign: "center", color: "var(--muted-55)" }}>14 gün içinde koşulsuz iade</div>}
        <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12, fontSize: 15 }}>
          {["Tüm kurslara kalıcı erişim", "Her kurs için ayrı sertifika", "Tüm kursları bitirince program sertifikası", "Sahip olduğun kurslar fiyattan düşülür"].map((t) => (
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

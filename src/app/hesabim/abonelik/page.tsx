import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/account/PageTitle";
import { PlusCheckout } from "@/components/account/PlusCheckout";
import { Corners } from "@/components/Corners";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/format";
import { PLUS_PRICE, getPlusInfo } from "@/lib/lms";

export const metadata: Metadata = { title: "Profect Plus" };

const PERKS = ["Yayındaki tüm kurslara erişim", "Sınırsız sertifika", "Aylık yenileme, taahhüt yok"];

export default async function SubscriptionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim/abonelik");
  const plus = await getPlusInfo(user.id);
  const price = formatPrice(PLUS_PRICE);
  return (
    <>
      <PageTitle title="Profect Plus" hint="Tüm kurslar ve sertifikalar tek abonelikte." />
      <div className="card blueprint elev-sm" style={{ background: "#fff", padding: 28, gap: 16, maxWidth: 560 }}>
        <Corners />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className={`tag ${plus.active ? "tag-accent" : "tag-neutral"}`}>{plus.active ? "Aktif" : "Aktif değil"}</span>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 40, lineHeight: 1, fontWeight: 700, color: "var(--color-accent-2)" }}>{price}<span style={{ fontSize: 16, fontWeight: 500, color: "var(--muted-55)" }}> /ay</span></span>
        </div>
        {plus.active && plus.until ? (
          <p style={{ margin: 0 }}>Erişimin <strong>{formatDate(plus.until)}</strong> tarihine kadar açık. Süreyi uzatmak için yenileyebilirsin; kalan günlerin kaybolmaz.</p>
        ) : plus.until ? (
          <p style={{ margin: 0 }}>Aboneliğin {formatDate(plus.until)} tarihinde sona erdi.</p>
        ) : (
          <p style={{ margin: 0 }}>Henüz Profect Plus aboneliğin yok.</p>
        )}
        <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10, fontSize: 15 }}>
          {PERKS.map((t) => (
            <div key={t} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="diamond" style={{ width: 8, height: 8, border: "1.5px solid var(--color-accent)", flex: "none" }} />
              {t}
            </div>
          ))}
        </div>
        {plus.pendingOrder ? (
          <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--muted-72)" }}>Plus siparişin onay bekliyor. Ödemen doğrulandığında erişimin açılacak.</p>
        ) : (
          <PlusCheckout label={plus.active ? "Süreyi uzat" : plus.until ? "Yeniden başlat" : "Profect Plus’a geç"} />
        )}
      </div>
    </>
  );
}

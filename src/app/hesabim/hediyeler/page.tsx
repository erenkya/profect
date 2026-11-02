import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/account/PageTitle";
import { GiftActions } from "@/components/gifts/GiftActions";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listGiftsForSender } from "@/lib/gifts";

export const metadata: Metadata = { title: "Hediyelerim" };

const STATUS = { pending: "Bekliyor", claimed: "Alındı", expired: "Süresi doldu", cancelled: "İptal edildi", awaiting_payment: "Ödeme bekliyor" } as const;

export default async function MyGiftsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim/hediyeler");
  const gifts = await listGiftsForSender(user.id);
  return (
    <>
      <PageTitle title="Hediyelerim" hint="Gönderdiğin kurs ve program hediyeleri. Mail alıcıya ulaşmazsa linki yenileyip ona başka bir yolla iletebilirsin." />
      {gifts.length === 0 ? (
        <p style={{ color: "var(--muted-72)" }}>Henüz hediye göndermedin. <Link href="/kurslar">Kursları keşfet →</Link></p>
      ) : (
        <div className="admin-table-wrap">
          <table className="table">
            <thead><tr><th>Hediye</th><th>Alıcı</th><th>Durum</th><th>Son tarih</th><th></th></tr></thead>
            <tbody>
              {gifts.map((g) => (
                <tr key={g.id}>
                  <td>{g.itemTitle}{g.kind === "program" && <span style={{ color: "var(--muted-55)" }}> · Program</span>}</td>
                  <td style={{ wordBreak: "break-all" }}>{g.recipientEmail}</td>
                  <td>{STATUS[g.status]}</td>
                  <td>{g.expiresAt ? formatDate(g.expiresAt) : "—"}</td>
                  <td>{g.status === "pending" && <GiftActions giftId={g.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

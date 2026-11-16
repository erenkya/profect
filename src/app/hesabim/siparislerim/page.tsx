import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/account/PageTitle";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/format";
import { listMyOrders, orderLabel } from "@/lib/lms";
import { withinRefundWindow } from "@/lib/refund-rules";

export const metadata: Metadata = { title: "Siparişlerim" };

const ORDER_STATUS = { pending: "Onay bekliyor", paid: "Ödendi", rejected: "Reddedildi", refunded: "İade edildi" } as const;

export default async function MyOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim/siparislerim");
  const orders = await listMyOrders(user.id);
  const now = new Date();
  return (
    <>
      <PageTitle title="Siparişlerim" />
      {orders.length === 0 ? (
        <p style={{ color: "var(--muted-72)" }}>Henüz siparişin yok. <Link href="/kurslar">Kursları keşfet →</Link></p>
      ) : (
        <div className="admin-table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Ürün</th><th>Tutar</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/hesabim/siparislerim/${o.id}`}>{o.id}</Link></td>
                  <td>{orderLabel(o)}</td>
                  <td>{formatPrice(o.amount)}</td>
                  <td>{ORDER_STATUS[o.status]}</td>
                  <td>{formatDate(o.created_at)}</td>
                  <td>
                    <Link href={`/hesabim/siparislerim/${o.id}`}>Detay →</Link>
                    {/* Yalnızca ipucu: kesin uygunluk (başlandı mı, hediye vb.) detay sayfasında hesaplanır. */}
                    {o.status === "paid" && withinRefundWindow(new Date(o.paid_at ?? o.created_at), now) && (
                      <div><Link href={`/hesabim/siparislerim/${o.id}#iade`}>İade talep et</Link></div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

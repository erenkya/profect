import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/account/PageTitle";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/format";
import { listMyOrders } from "@/lib/lms";

export const metadata: Metadata = { title: "Siparişlerim" };

const ORDER_STATUS = { pending: "Onay bekliyor", paid: "Ödendi", rejected: "Reddedildi" } as const;

export default async function MyOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim/siparislerim");
  const orders = await listMyOrders(user.id);
  return (
    <>
      <PageTitle title="Siparişlerim" />
      {orders.length === 0 ? (
        <p style={{ color: "var(--muted-72)" }}>Henüz siparişin yok. <Link href="/kurslar">Kursları keşfet →</Link></p>
      ) : (
        <div className="admin-table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>Ürün</th><th>Tutar</th><th>Durum</th><th>Tarih</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.plan === "plus" ? "Profect Plus (aylık)" : o.course_title ?? "—"}</td>
                  <td>{formatPrice(o.amount)}</td>
                  <td>{ORDER_STATUS[o.status]}</td>
                  <td>{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageTitle } from "@/components/account/PageTitle";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/format";
import { getMyOrderDetail } from "@/lib/lms";

export const metadata: Metadata = { title: "Sipariş detayı" };

const ORDER_STATUS = { pending: "Onay bekliyor", paid: "Ödendi", rejected: "Reddedildi" } as const;
const GIFT_STATUS = { awaiting_payment: "Ödeme bekliyor", pending: "Alıcının almasını bekliyor", claimed: "Alıcı aldı", expired: "Süresi doldu", cancelled: "İptal edildi" } as const;
const PROVIDER = { manual: "Havale / elle onay", mock: "Test ödemesi", tami: "Kredi / banka kartı" } as Record<string, string>;
const ITEM_TYPE = { course: "Kurs", program: "Uzmanlık Programı", plus: "Abonelik" } as const;

/** T.C. kimlik no'yu tamamen göstermeyiz: ilk iki ve son iki hane. */
const maskTckn = (v: string) => (v.length === 11 ? `${v.slice(0, 2)}*******${v.slice(-2)}` : "***");

type Props = { params: Promise<{ id: string }> };

export default async function MyOrderDetailPage({ params }: Props) {
  const { id } = await params;
  const orderId = /^\d+$/.test(id) ? Number(id) : NaN;
  const user = await getCurrentUser();
  if (!user) redirect(`/giris?next=/hesabim/siparislerim/${encodeURIComponent(id)}`);
  if (!Number.isSafeInteger(orderId)) notFound();
  const order = await getMyOrderDetail(user.id, orderId);
  if (!order) notFound();

  const inv = order.invoice;
  const addressLine = [inv.address, [inv.district, inv.city].filter(Boolean).join(" / "), inv.zip_code].filter(Boolean).join(", ");
  const invoiceRows: [string, string][] = (
    [
      ["Fatura türü", inv.type === "kurumsal" ? "Kurumsal" : inv.type === "bireysel" ? "Bireysel" : ""],
      ["Ad soyad", inv.full_name ?? ""],
      ["Şirket", inv.company_name ?? ""],
      ["Vergi dairesi / no", [inv.tax_office, inv.tax_number].filter(Boolean).join(" / ")],
      ["T.C. kimlik no", inv.tckn ? maskTckn(inv.tckn) : ""],
      ["E-posta", inv.email ?? ""],
      ["Telefon", inv.phone ?? ""],
      ["Adres", addressLine],
    ] as [string, string][]
  ).filter(([, v]) => v);

  const paymentRows: [string, string][] = (
    [
      ["Ödeme yöntemi", PROVIDER[order.provider] ?? order.provider],
      ["Kart", order.masked_card ?? ""],
      ["Sipariş tarihi", formatDate(order.created_at)],
      ["Ödeme tarihi", order.paid_at ? formatDate(order.paid_at) : ""],
    ] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <>
      <PageTitle title={`Sipariş #${order.id}`} hint={<Link href="/hesabim/siparislerim">← Tüm siparişlerim</Link>} />

      <div className="order-status" data-status={order.status}>
        <strong>{ORDER_STATUS[order.status]}</strong>
        {order.status === "pending" && <span>Siparişin yönetici onayından sonra hesabına tanımlanır.</span>}
        {order.status === "rejected" && <span>{order.error_message || "Ödeme tamamlanamadı."}</span>}
      </div>

      <section className="order-box">
        <h2>Ürünler</h2>
        <ul className="order-items">
          {order.items.map((it, i) => (
            <li key={i}>
              <div>
                {it.href ? <Link href={it.href}>{it.title}</Link> : it.title}
                <span className="order-tag">{ITEM_TYPE[it.type]}</span>
              </div>
              <span>{formatPrice(it.price)}</span>
            </li>
          ))}
        </ul>
        <dl className="order-sum">
          {(order.discount > 0 || order.items.length > 1) && (
            <div><dt>Ara toplam</dt><dd>{formatPrice(order.subtotal)}</dd></div>
          )}
          {order.discount > 0 && (
            <div><dt>İndirim{order.coupon_code ? ` (${order.coupon_code})` : ""}</dt><dd>−{formatPrice(order.discount)}</dd></div>
          )}
          <div className="order-total"><dt>{order.status === "paid" ? "Ödenen tutar" : "Tutar"}</dt><dd>{formatPrice(order.total)}</dd></div>
        </dl>
      </section>

      {order.gift && (
        <section className="order-box">
          <h2>Hediye</h2>
          <dl className="order-kv">
            <div><dt>Alıcı</dt><dd style={{ wordBreak: "break-all" }}>{order.gift.recipient_email}</dd></div>
            <div><dt>Durum</dt><dd>{GIFT_STATUS[order.gift.status]}</dd></div>
          </dl>
          <p style={{ margin: "12px 0 0" }}><Link href="/hesabim/hediyeler">Hediyelerim →</Link></p>
        </section>
      )}

      <section className="order-box">
        <h2>Ödeme</h2>
        <dl className="order-kv">
          {paymentRows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </section>

      {invoiceRows.length > 0 && (
        <section className="order-box">
          <h2>Fatura bilgileri</h2>
          <dl className="order-kv">
            {invoiceRows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </section>
      )}
    </>
  );
}

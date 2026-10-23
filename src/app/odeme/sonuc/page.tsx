import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Corners } from "@/components/Corners";
import { ClearCartOnMount } from "@/components/checkout/ClearCartOnMount";
import { formatPrice } from "@/lib/format";
import { parseId } from "@/lib/http";

export const metadata: Metadata = { title: "Sipariş sonucu", robots: { index: false, follow: false } };

export default async function CheckoutResultPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const { orderId } = await searchParams;
  const id = parseId(orderId ?? "");
  const user = await getCurrentUser();
  if (!user) redirect(`/giris?next=${encodeURIComponent(`/odeme/sonuc?orderId=${orderId ?? ""}`)}`);

  const [rows] = id
    ? await pool.query<RowDataPacket[]>("SELECT id, amount, status, error_message FROM orders WHERE id = ? AND user_id = ?", [id, user.id])
    : [[] as RowDataPacket[]];
  const order = rows[0] as { id: number; amount: string; status: "pending" | "paid" | "rejected"; error_message: string | null } | undefined;
  const [items] = order ? await pool.query<RowDataPacket[]>("SELECT title FROM order_items WHERE order_id = ? ORDER BY id", [order.id]) : [[] as RowDataPacket[]];

  const view = !order
    ? { title: "Sipariş bulunamadı", body: "Bu sipariş kaydına ulaşılamadı.", cta: { href: "/hesabim/siparislerim", label: "Siparişlerim" } }
    : order.status === "paid"
      ? { title: "Ödemen alındı", body: "Erişimin açıldı. Kurslarına hesabından ulaşabilirsin.", cta: { href: "/hesabim/kurslarim", label: "Kurslarım" } }
      : order.status === "pending"
        ? { title: "Siparişin alındı", body: "Siparişin onay bekliyor. Ödemen doğrulandığında erişimin hesabında açılacak.", cta: { href: "/hesabim/siparislerim", label: "Siparişlerim" } }
        : { title: "Ödeme tamamlanamadı", body: order.error_message ? `Banka yanıtı: ${order.error_message}` : "Ödeme onaylanmadı.", cta: { href: "/sepet", label: "Sepete dön ve tekrar dene" } };

  return (
    <main style={{ minHeight: "calc(100vh - 140px)", display: "grid", placeItems: "center", padding: "clamp(40px,8vw,96px) 20px" }}>
      {order && order.status !== "rejected" && <ClearCartOnMount />}
      <div className="card blueprint elev-md" style={{ width: "min(520px,100%)", background: "#fff", padding: "clamp(24px,5vw,40px)", gap: 16 }}>
        <Corners />
        <h1 style={{ fontSize: 34, textTransform: "uppercase", margin: 0 }}>{view.title}</h1>
        <p style={{ margin: 0, color: "var(--muted-72)" }}>{view.body}</p>
        {order && (
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 12, fontSize: 15, display: "flex", flexDirection: "column", gap: 6 }}>
            <div>Sipariş no: <strong style={{ fontWeight: 600 }}>#{order.id}</strong></div>
            {(items as { title: string }[]).map((i) => <div key={i.title}>• {i.title}</div>)}
            <div>Tutar: <strong style={{ fontWeight: 600 }}>{formatPrice(order.amount)}</strong></div>
          </div>
        )}
        <Link href={view.cta.href} className="btn btn-primary blueprint btn-block" style={{ fontSize: 17, padding: 13 }}><Corners />{view.cta.label}</Link>
      </div>
    </main>
  );
}

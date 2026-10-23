"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast, useFlash } from "./Toast";
import { formatDate, formatPrice } from "@/lib/format";
import { adminApi } from "./api";

export type OrderRow = { id: number; plan: "single" | "plus" | "cart"; amount: string; status: "pending" | "paid" | "rejected"; provider: string; created_at: string; paid_at: string | null; user_name: string; user_email: string; course_title: string | null; items_summary: string | null; invoice_type: "bireysel" | "kurumsal" | null; company_name: string | null; tckn: string | null; tax_number: string | null; tax_office: string | null; phone: string | null; address: string | null; city: string | null; district: string | null; error_message: string | null; coupon_code: string | null; discount_amount: string };
const STATUS = { pending: "Onay bekliyor", paid: "Ödendi", rejected: "Reddedildi" } as const;

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [flash, setFlash] = useFlash();

  async function act(id: number, action: "approve" | "reject") {
    if (!confirm(action === "approve" ? "Ödeme alındı olarak işaretlenip erişim verilsin mi?" : "Sipariş reddedilsin mi?")) return;
    const r = await adminApi("PATCH", `/api/admin/orders/${id}`, { action });
    setFlash({ kind: r.ok ? "ok" : "error", text: r.message });
    if (r.ok) router.refresh();
  }

  return (
    <>
      <Toast flash={flash} onClose={() => setFlash(null)} />
      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>Kullanıcı</th><th>Ürün</th><th>Tutar</th><th>Durum</th><th>Tarih</th><th /></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.user_name}<div style={{ fontSize: 12, color: "var(--muted-55)" }}>{o.user_email}</div></td>
                <td>
                  {o.items_summary ?? (o.plan === "plus" ? "Profect Plus (aylık)" : o.course_title ?? "—")}
                  {o.invoice_type === "kurumsal" && (
                    <details style={{ fontSize: 12, color: "var(--muted-55)", whiteSpace: "normal" }}>
                      <summary style={{ cursor: "pointer" }}>Kurumsal fatura bilgisi</summary>
                      <div>{o.company_name} · {o.tax_office} V.D. · VKN {o.tax_number}</div>
                      <div>{o.phone}</div>
                      <div>{o.address}, {o.district}/{o.city}</div>
                    </details>
                  )}
                  {o.coupon_code && <div style={{ fontSize: 12, color: "#1d8a55" }}>Kupon {o.coupon_code} · −{formatPrice(o.discount_amount)}</div>}
                  {o.error_message && <div style={{ fontSize: 12, color: "var(--color-accent-2-700)" }}>{o.error_message}</div>}
                </td>
                <td>{formatPrice(o.amount)}</td>
                <td><span className={`tag ${o.status === "paid" ? "tag-accent" : "tag-neutral"}`}>{STATUS[o.status]}</span></td>
                <td>{formatDate(o.created_at)}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  {o.status === "pending" && (
                    <>
                      <button className="btn btn-primary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => act(o.id, "approve")}>Onayla</button>
                      <button className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => act(o.id, "reject")}>Reddet</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted-55)" }}>Henüz sipariş yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

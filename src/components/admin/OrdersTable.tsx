"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/AuthShell";
import { formatDate, formatPrice } from "@/lib/format";
import { adminApi } from "./api";

export type OrderRow = { id: number; plan: "single" | "plus"; amount: string; status: "pending" | "paid" | "rejected"; provider: string; created_at: string; paid_at: string | null; user_name: string; user_email: string; course_title: string | null };
const STATUS = { pending: "Onay bekliyor", paid: "Ödendi", rejected: "Reddedildi" } as const;

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function act(id: number, action: "approve" | "reject") {
    if (!confirm(action === "approve" ? "Ödeme alındı olarak işaretlenip erişim verilsin mi?" : "Sipariş reddedilsin mi?")) return;
    const r = await adminApi("PATCH", `/api/admin/orders/${id}`, { action });
    setFlash({ kind: r.ok ? "ok" : "error", text: r.message });
    if (r.ok) router.refresh();
  }

  return (
    <>
      {flash && <div style={{ marginBottom: 12 }}><FormMessage kind={flash.kind}>{flash.text}</FormMessage></div>}
      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>Kullanıcı</th><th>Ürün</th><th>Tutar</th><th>Durum</th><th>Tarih</th><th /></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{o.user_name}<div style={{ fontSize: 12, color: "var(--muted-55)" }}>{o.user_email}</div></td>
                <td>{o.plan === "plus" ? "Profect Plus (aylık)" : o.course_title ?? "—"}</td>
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

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast, useFlash } from "./Toast";
import { formatDate, formatPrice } from "@/lib/format";
import { adminApi } from "./api";
import { REFUND_REASON_TEXT, canOverride, isAutomaticProvider, type RefundBlockReason, type RefundStatus } from "@/lib/refund-rules";

export type RefundRow = {
  id: number; order_id: number; status: RefundStatus; amount: string; reason: string | null; decision_note: string | null; error_message: string | null;
  created_at: string; user_name: string; user_email: string; items_summary: string | null; provider: string; provider_ref: string | null; paid_at: string | null; paid_days: number;
  blocks: RefundBlockReason[];
};
const STATUS: Record<RefundStatus, string> = { requested: "Karar bekliyor", approved: "Onaylandı · banka iadesi bekleniyor", refunded: "İade edildi", rejected: "Reddedildi", failed: "Sağlayıcı hatası" };

export function RefundsTable({ refunds }: { refunds: RefundRow[] }) {
  const router = useRouter();
  const [flash, setFlash] = useFlash();
  const [notes, setNotes] = useState<Record<number, string>>({});

  async function act(r: RefundRow, action: "approve" | "reject" | "mark_refunded", override = false) {
    const note = (notes[r.id] ?? "").trim();
    if ((action === "reject" || override) && !note) {
      setFlash({ kind: "error", text: "Bu işlem için gerekçe notu yaz." });
      return;
    }
    const summary = `#${r.order_id} · ${r.user_name} · ${formatPrice(r.amount)}`;
    const ask = {
      approve: override
        ? `Uygunluk kurallarına takılan bu iade onaylansın mı?\n\n${summary}`
        : isAutomaticProvider(r.provider)
          ? `İade onaylansın mı? Erişim hemen kapanır.\n\n${summary}`
          : `İade onaylansın mı? Havale siparişi: parayı bankadan elle iade edip "İade yapıldı"ya basana kadar erişim kapanmaz.\n\n${summary}`,
      reject: `İade reddedilsin mi?\n\n${summary}`,
      mark_refunded: `Banka iadesini yaptığından emin misin?\n\n${summary}`,
    }[action];
    if (!confirm(ask)) return;
    // 2. onay: para ve erişim etkisi geri alınamaz.
    if (action !== "reject" && !confirm(`SON ONAY\n\n${summary}\n\nBu işlem geri alınamaz.`)) return;
    const res = await adminApi("PATCH", `/api/admin/refunds/${r.id}`, { action, ...(note ? { note } : {}), ...(override ? { override: true } : {}) });
    setFlash({ kind: res.ok && res.json.status !== "failed" ? "ok" : "error", text: res.message });
    if (res.ok) router.refresh();
  }

  return (
    <>
      <Toast flash={flash} onClose={() => setFlash(null)} />
      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>Sipariş</th><th>Kullanıcı</th><th>Ürün</th><th>Tutar</th><th>Durum</th><th>Başvuru</th><th /></tr></thead>
          <tbody>
            {refunds.map((r) => {
              const open = r.status === "requested" || r.status === "failed";
              const overridable = open && canOverride(r.blocks);
              return (
                <tr key={r.id}>
                  <td>#{r.order_id}<div style={{ fontSize: 12, color: "var(--muted-55)" }}>{r.paid_days}. gün</div></td>
                  <td>{r.user_name}<div style={{ fontSize: 12, color: "var(--muted-55)" }}>{r.user_email}</div></td>
                  <td>{r.items_summary ?? "—"}</td>
                  <td>{formatPrice(r.amount)}</td>
                  <td>
                    <span className={`tag ${r.status === "refunded" ? "tag-accent" : "tag-neutral"}`}>{STATUS[r.status]}</span>
                    {r.error_message && <div style={{ fontSize: 12, color: "var(--color-accent-2-700)" }}>{r.error_message}</div>}
                    {r.decision_note && <div style={{ fontSize: 12, color: "var(--muted-55)", whiteSpace: "normal" }}>Not: {r.decision_note}</div>}
                  </td>
                  <td style={{ whiteSpace: "normal", maxWidth: 280 }}>
                    {r.reason && <div>{r.reason}</div>}
                    <div style={{ fontSize: 12, color: "var(--muted-55)" }}>{formatDate(r.created_at)}</div>
                    {r.blocks.length > 0 && (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--color-accent-2-700)" }}>
                        {r.blocks.map((b) => <li key={b}>{REFUND_REASON_TEXT[b]}</li>)}
                      </ul>
                    )}
                  </td>
                  <td style={{ whiteSpace: "normal", minWidth: 220 }}>
                    {open && <input className="input" placeholder="Gerekçe notu (red / istisna için zorunlu)" maxLength={500} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} style={{ background: "#fff", minHeight: 32, fontSize: 13, marginBottom: 6, width: "100%" }} />}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {open && r.blocks.length === 0 && <button className="btn btn-primary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => act(r, "approve")}>{r.status === "failed" ? "Yeniden dene" : "Onayla"}</button>}
                      {overridable && <button className="btn btn-primary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => act(r, "approve", true)}>Uygunluk dışı onayla</button>}
                      {open && <button className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => act(r, "reject")}>Reddet</button>}
                      {r.status === "approved" && !isAutomaticProvider(r.provider) && <button className="btn btn-primary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => act(r, "mark_refunded")}>İade yapıldı</button>}
                      {r.status === "approved" && isAutomaticProvider(r.provider) && r.provider_ref && <button className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => act(r, "approve")}>Sonuçlandır</button>}
                      {r.status === "approved" && isAutomaticProvider(r.provider) && !r.provider_ref && <span style={{ fontSize: 12, color: "var(--color-accent-2-700)" }}>Sağlayıcı çağrısı doğrulanamadı: iadenin yapılıp yapılmadığını sağlayıcıda kontrol et.</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {refunds.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted-55)" }}>Henüz iade talebi yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/AuthShell";
import { formatDate } from "@/lib/format";
import { REFUND_REASON_TEXT, type RefundStatus } from "@/lib/refund-rules";
import type { RefundView } from "@/lib/refund";

const REQUEST_TEXT: Record<RefundStatus, string> = {
  requested: "İade talebiniz inceleniyor.",
  approved: "İade talebiniz onaylandı. Tutar, bankanızın işlem sürelerine bağlı olarak en geç 10 iş günü içinde yansır.",
  refunded: "İade edildi. Tutar, bankanızın işlem sürelerine bağlı olarak en geç 10 iş günü içinde yansır.",
  rejected: "İade talebiniz reddedildi.",
  failed: "İade işleminiz inceleniyor.",
};

/** Sipariş detayındaki iade bölümü: uygunsa talep formu, değilse nedenler, başvuru varsa durumu (bölüm hiç gizlenmez). */
export function RefundSection({ orderId, view }: { orderId: number; view: RefundView }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/refund`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      const json = await res.json();
      if (res.ok) router.refresh();
      else setMsg({ kind: "error", text: json.message ?? "İade talebi gönderilemedi." });
    } catch {
      setMsg({ kind: "error", text: "Bağlantı hatası." });
    } finally {
      setBusy(false);
    }
  }

  const req = view.request;
  return (
    <section className="order-box" id="iade">
      <h2>İade</h2>
      {req ? (
        <>
          <p style={{ margin: 0 }}>{REQUEST_TEXT[req.status]}</p>
          {req.status === "rejected" && req.decisionNote && <p style={{ margin: "8px 0 0", color: "var(--muted-72)" }}>Gerekçe: {req.decisionNote}</p>}
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-55)" }}>Başvuru tarihi: {formatDate(req.createdAt)}</p>
        </>
      ) : view.eligible ? (
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
          <p style={{ margin: 0, color: "var(--muted-72)" }}>
            Bu sipariş için iade talep edebilirsin{view.windowEndsAt ? ` (son başvuru tarihi: ${formatDate(view.windowEndsAt)})` : ""}. Onaylanırsa ilgili eğitimlere erişimin kapatılır.
          </p>
          <div className="field">
            <label htmlFor="refund-reason">Gerekçe (isteğe bağlı)</label>
            <textarea id="refund-reason" className="input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} style={{ background: "#fff", fontSize: 15 }} />
          </div>
          {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
          <button type="submit" disabled={busy} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>{busy ? "Gönderiliyor…" : "İade talep et"}</button>
        </form>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {view.reasons.map((r) => <li key={r}>{REFUND_REASON_TEXT[r]}</li>)}
        </ul>
      )}
    </section>
  );
}

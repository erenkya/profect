"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/AuthShell";

/** Onay bekleyen siparişi iptal etme bölümü (sipariş detayı). Sunucu durumu yeniden doğrular. */
export function CancelOrderSection({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCancel() {
    if (!confirm("Bu siparişi iptal etmek istediğinden emin misin? Bu işlem geri alınamaz.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) router.refresh();
      else setMsg(json.message ?? "Sipariş iptal edilemedi.");
    } catch {
      setMsg("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="order-box">
      <h2>Siparişi iptal et</h2>
      <p style={{ margin: "0 0 12px", color: "var(--muted-72)" }}>Sipariş henüz onaylanmadığı için ücretsiz iptal edebilirsin.</p>
      {msg && <FormMessage kind="error">{msg}</FormMessage>}
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>{busy ? "İptal ediliyor…" : "Siparişi iptal et"}</button>
    </section>
  );
}

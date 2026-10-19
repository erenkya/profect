"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Corners } from "@/components/Corners";
import { FormMessage } from "@/components/auth/AuthShell";

export function PlusCheckout({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function order() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "plus" }) });
      const json = await res.json();
      if (!res.ok) return setMsg({ kind: "error", text: json.message ?? "Sipariş oluşturulamadı." });
      if (json.status === "paid") router.refresh();
      else {
        setMsg({ kind: "ok", text: "Siparişin onay bekliyor. Ödemen doğrulandığında Profect Plus erişimin açılacak." });
        router.refresh();
      }
    } catch {
      setMsg({ kind: "error", text: "Bağlantı hatası. Lütfen tekrar deneyin." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <button type="button" onClick={order} disabled={busy} className="btn btn-primary blueprint" style={{ padding: "12px 24px" }}>
        <Corners />
        {busy ? "İşleniyor…" : label}
      </button>
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
    </div>
  );
}

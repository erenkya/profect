"use client";

import { useEffect, useState } from "react";
import { FormMessage } from "@/components/auth/AuthShell";

/** Bekleyen hediyenin eylemleri: linki yenile+kopyala ve maili yeniden gönder. İkisi de eski linki geçersiz kılar. */
export function GiftActions({ giftId }: { giftId: number }) {
  const [busy, setBusy] = useState<"copy" | "email" | null>(null);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function run(mode: "copy" | "email") {
    setBusy(mode);
    setInfo("");
    setError("");
    setLink("");
    try {
      const res = await fetch(`/api/gifts/${giftId}/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "İşlem yapılamadı.");
        if (typeof json.retryAfter === "number") setCooldown(json.retryAfter);
        return;
      }
      if (mode === "email" && json.emailed) {
        setInfo("Alıcıya yeni linkli mail gönderildi. Önceki link artık geçersiz.");
      } else if (mode === "email") {
        setError("Mail gönderilemedi. Yeni link aşağıda; alıcıya kendiniz iletebilirsiniz. Önceki link artık geçersiz.");
        setLink(json.link);
      } else {
        try {
          await navigator.clipboard.writeText(json.link);
          setInfo("Link kopyalandı. Önceki link artık geçersiz.");
        } catch {
          setInfo("Yeni link aşağıda. Önceki link artık geçersiz.");
          setLink(json.link); // pano erişimi reddedilirse elle kopyalanabilsin
        }
      }
      setCooldown(60);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null || cooldown > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 220 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => run("copy")} style={{ fontSize: 13, padding: "6px 10px" }}>
          {busy === "copy" ? "…" : "Linki yenile ve kopyala"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => run("email")} style={{ fontSize: 13, padding: "6px 10px" }}>
          {busy === "email" ? "…" : "Maili yeniden gönder"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-55)" }}>
        Yenilenen linkle birlikte eski link geçersiz olur.{cooldown > 0 ? ` (${cooldown} sn bekleyin)` : ""}
      </div>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {info && <FormMessage kind="ok">{info}</FormMessage>}
      {link && <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Hediye linki" style={{ fontSize: 12 }} />}
    </div>
  );
}

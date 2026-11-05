"use client";

import { useState } from "react";
import { utcToIstanbulInput } from "@/lib/due-rules";

/**
 * Türkiye saatiyle tarih + saat seçici. `value` DB'deki UTC metnidir; `onSave` Türkiye saatiyle "2026-11-05T14:30" ya da (kaldır) null alır.
 * Üst bileşen `key={value ?? "none"}` vermeli: kayıttan sonra alan sunucudaki değerle yeniden başlasın.
 */
export function DueEditor({ value, label, saveLabel = "Kaydet", onSave }: { value: string | null; label: string; saveLabel?: string; onSave: (local: string | null) => Promise<void> }) {
  const [local, setLocal] = useState(value ? utcToIstanbulInput(value) : "");
  const [busy, setBusy] = useState(false);
  const dirty = local !== (value ? utcToIstanbulInput(value) : "");

  async function save(next: string | null) {
    setBusy(true);
    try { await onSave(next); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input
        className="input"
        type="datetime-local"
        step={60}
        aria-label={`${label} (Türkiye saati)`}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        style={{ background: "#fff", minHeight: 36, width: 200 }}
      />
      <button type="button" className="btn btn-secondary" disabled={busy || !local || !dirty} onClick={() => void save(local)} style={{ padding: "6px 12px" }}>{saveLabel}</button>
      {value && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void save(null)} style={{ padding: "6px 12px" }}>Kaldır</button>}
    </div>
  );
}

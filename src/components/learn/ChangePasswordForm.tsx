"use client";

import { useState } from "react";
import { FormMessage } from "@/components/auth/AuthShell";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const json = await res.json();
      setMsg({ kind: res.ok ? "ok" : "error", text: json.message });
      if (res.ok) {
        setCurrent("");
        setNext("");
      }
    } catch {
      setMsg({ kind: "error", text: "Bağlantı hatası." });
    } finally {
      setBusy(false);
    }
  }

  const input = { background: "#fff", minHeight: 40, fontSize: 15 } as const;
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
      <div className="field"><label htmlFor="cur">Mevcut şifre</label><input id="cur" className="input" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} style={input} /></div>
      <div className="field"><label htmlFor="new">Yeni şifre (en az 8 karakter)</label><input id="new" className="input" type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} style={input} /></div>
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
      <button type="submit" disabled={busy} className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>{busy ? "Kaydediliyor…" : "Şifreyi güncelle"}</button>
    </form>
  );
}

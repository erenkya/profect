"use client";

import { useState } from "react";
import { FormMessage } from "@/components/auth/AuthShell";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { evaluatePassword } from "@/lib/password-strength";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
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
        setConfirm("");
      }
    } catch {
      setMsg({ kind: "error", text: "Bağlantı hatası." });
    } finally {
      setBusy(false);
    }
  }

  const mismatch = confirm.length > 0 && confirm !== next;
  const input = { background: "#fff", minHeight: 40, fontSize: 15 } as const;
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
      <div className="field"><label htmlFor="cur">Mevcut şifre</label><input id="cur" className="input" type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} style={input} /></div>
      <div className="field"><label htmlFor="new">Yeni şifre</label><input id="new" className="input" type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} style={input} /></div>
      <PasswordStrength password={next} />
      <div className="field"><label htmlFor="new2">Yeni şifre (tekrar)</label><input id="new2" className="input" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} style={input} /></div>
      {mismatch && <FormMessage kind="error">Şifreler eşleşmiyor.</FormMessage>}
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
      <button type="submit" disabled={busy || !evaluatePassword(next).acceptable || confirm !== next} className="btn btn-secondary" style={{ alignSelf: "flex-start" }}>{busy ? "Kaydediliyor…" : "Şifreyi güncelle"}</button>
    </form>
  );
}

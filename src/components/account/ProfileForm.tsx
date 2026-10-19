"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormMessage } from "@/components/auth/AuthShell";

export function ProfileForm({ initialName, initialPhone, email }: { initialName: string; initialPhone: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ full_name: name, phone }) });
      const json = await res.json();
      setMsg({ kind: res.ok ? "ok" : "error", text: json.message });
      if (res.ok) router.refresh(); // Navbar'daki ad da güncellensin
    } catch {
      setMsg({ kind: "error", text: "Bağlantı hatası." });
    } finally {
      setBusy(false);
    }
  }

  const input = { background: "#fff", minHeight: 40, fontSize: 15 } as const;
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
      <div className="field"><label htmlFor="pf-name">Ad soyad</label><input id="pf-name" className="input" required minLength={2} maxLength={150} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} style={input} /></div>
      <div className="field"><label htmlFor="pf-mail">E-posta</label><input id="pf-mail" className="input" type="email" value={email} readOnly aria-describedby="pf-mail-hint" style={{ ...input, background: "var(--color-surface)", color: "var(--muted-72)" }} /><span id="pf-mail-hint" style={{ fontSize: 13, color: "var(--muted-55)" }}>E-posta adresi değiştirilemez.</span></div>
      <div className="field"><label htmlFor="pf-phone">Telefon (isteğe bağlı)</label><input id="pf-phone" className="input" type="tel" maxLength={40} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={input} /></div>
      {msg && <FormMessage kind={msg.kind}>{msg.text}</FormMessage>}
      <button type="submit" disabled={busy} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
    </form>
  );
}

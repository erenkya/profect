"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Şirketi olmayan kullanıcı için "Şirkete katıl" alanı: kod girilir, katılım isteği şirket yöneticisinin onayına gider. */
export function JoinCompanyForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/company/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        return;
      }
      setMsg({ kind: "error", text: json.message ?? "Katılma isteği gönderilemedi." });
    } catch {
      setMsg({ kind: "error", text: "Bağlantı hatası. Lütfen tekrar deneyin." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
      <div className="field">
        <label htmlFor="join_code">Şirket kodu</label>
        <input id="join_code" className="input" required autoComplete="off" placeholder="ACME-7K4Q" value={code} onChange={(e) => setCode(e.target.value)} style={{ background: "#fff" }} />
      </div>
      <button type="submit" className="btn btn-secondary" disabled={busy || !code.trim()} style={{ alignSelf: "start" }}>{busy ? "Gönderiliyor…" : "Şirkete katıl"}</button>
      {msg && <div role={msg.kind === "error" ? "alert" : "status"} style={{ fontSize: 14, color: msg.kind === "error" ? "var(--color-accent-2-800)" : "var(--color-accent-800)" }}>{msg.text}</div>}
    </form>
  );
}

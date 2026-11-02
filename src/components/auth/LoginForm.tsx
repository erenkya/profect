"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { Corners } from "@/components/Corners";
import { FormMessage } from "./AuthShell";

export function LoginForm({ siteKey, next }: { siteKey: string; next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken: token }),
      });
      const json = await res.json();
      if (res.ok) {
        router.push(next);
        router.refresh();
        return;
      }
      if (json.needsVerification) {
        const q = new URLSearchParams({ email: json.email ?? email.trim().toLowerCase() });
        if (next !== "/hesabim") q.set("next", next);
        router.push(`/e-posta-dogrula?${q}`);
        return;
      }
      setError(json.message ?? "Giriş başarısız.");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="field">
        <label htmlFor="email">E-posta</label>
        <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ background: "#fff", minHeight: 44, fontSize: 16 }} />
      </div>
      <div className="field">
        <label htmlFor="password">Şifre</label>
        <input id="password" className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ background: "#fff", minHeight: 44, fontSize: 16 }} />
        <Link href="/sifremi-unuttum" style={{ alignSelf: "flex-end", fontSize: 14, marginTop: 6 }}>Şifrenizi mi unuttunuz?</Link>
      </div>
      {siteKey && <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken("")} options={{ theme: "light" }} />}
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <button type="submit" disabled={busy || (!!siteKey && !token)} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: 13 }}>
        <Corners />
        {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
      </button>
      <div style={{ fontSize: 14 }}>
        <span>Hesabın yok mu? <Link href={`/kayit${next !== "/hesabim" ? `?next=${encodeURIComponent(next)}` : ""}`}>Kayıt ol</Link></span>
      </div>
    </form>
  );
}

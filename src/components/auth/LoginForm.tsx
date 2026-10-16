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
  const [needsVerification, setNeedsVerification] = useState(false);
  const [info, setInfo] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    setNeedsVerification(false);
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
      setError(json.message ?? "Giriş başarısız.");
      setNeedsVerification(!!json.needsVerification);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    setInfo(json.message ?? "Gönderildi.");
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
      </div>
      {siteKey && <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken("")} options={{ theme: "light" }} />}
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {info && <FormMessage kind="ok">{info}</FormMessage>}
      {needsVerification && (
        <button type="button" className="btn btn-secondary" onClick={resend}>Doğrulama e-postasını tekrar gönder</button>
      )}
      <button type="submit" disabled={busy || (!!siteKey && !token)} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: 13 }}>
        <Corners />
        {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, flexWrap: "wrap", gap: 8 }}>
        <Link href="/sifremi-unuttum">Şifremi unuttum</Link>
        <span>Hesabın yok mu? <Link href={`/kayit${next !== "/hesabim" ? `?next=${encodeURIComponent(next)}` : ""}`}>Kayıt ol</Link></span>
      </div>
    </form>
  );
}

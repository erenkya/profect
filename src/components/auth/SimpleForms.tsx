"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Corners } from "@/components/Corners";
import { evaluatePassword } from "@/lib/password-strength";
import { FormMessage } from "./AuthShell";
import { PasswordStrength } from "./PasswordStrength";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      setMsg((await res.json()).message);
    } catch {
      setMsg("Bağlantı hatası. Lütfen tekrar deneyin.");
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
      {msg && <FormMessage kind="ok">{msg}</FormMessage>}
      <button type="submit" disabled={busy} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: 13 }}>
        <Corners />
        {busy ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
      </button>
      <Link href="/giris" style={{ fontSize: 14 }}>← Girişe dön</Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, newPassword: password }) });
      const json = await res.json();
      if (res.ok) setDone(json.message);
      else setError(json.message);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  if (!token) return <FormMessage kind="error">Sıfırlama bağlantısı eksik. Lütfen e-postadaki bağlantıyı kullanın.</FormMessage>;
  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormMessage kind="ok">{done}</FormMessage>
        <Link href="/giris" className="btn btn-primary blueprint"><Corners />Giriş yap</Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="field">
        <label htmlFor="np">Yeni şifre</label>
        <input id="np" className="input" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ background: "#fff", minHeight: 44, fontSize: 16 }} />
      </div>
      <PasswordStrength password={password} />
      <div className="field">
        <label htmlFor="np2">Yeni şifre (tekrar)</label>
        <input id="np2" className="input" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} style={{ background: "#fff", minHeight: 44, fontSize: 16 }} />
      </div>
      {mismatch && <FormMessage kind="error">Şifreler eşleşmiyor.</FormMessage>}
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <button type="submit" disabled={busy || !evaluatePassword(password).acceptable || confirm !== password} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: 13 }}>
        <Corners />
        {busy ? "Kaydediliyor…" : "Şifreyi güncelle"}
      </button>
    </form>
  );
}

export function VerifyEmail({ token }: { token: string }) {
  const [state, setState] = useState<{ kind: "loading" | "ok" | "bad"; message: string }>({ kind: "loading", message: "Doğrulanıyor…" });
  const started = useRef(false); // Strict Mode çift efektinde tek kullanımlık token iki kez harcanmasın

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ kind: "bad", message: "Doğrulama bağlantısı eksik." });
      return;
    }
    fetch("/api/auth/verify-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (res) => setState({ kind: res.ok ? "ok" : "bad", message: (await res.json()).message }))
      .catch(() => setState({ kind: "bad", message: "Bağlantı hatası. Lütfen tekrar deneyin." }));
  }, [token]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {state.kind === "loading" ? <p style={{ margin: 0 }}>{state.message}</p> : <FormMessage kind={state.kind === "ok" ? "ok" : "error"}>{state.message}</FormMessage>}
      {state.kind === "ok" && <Link href="/giris" className="btn btn-primary blueprint"><Corners />Giriş yap</Link>}
      {state.kind === "bad" && <Link href="/giris" className="btn btn-secondary">Girişe dön</Link>}
    </div>
  );
}

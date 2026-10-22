"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { Corners } from "@/components/Corners";
import { evaluatePassword } from "@/lib/password-strength";
import { KvkkDialog } from "@/components/legal/KvkkDialog";
import { FormMessage } from "./AuthShell";
import { PasswordStrength } from "./PasswordStrength";

export function RegisterForm({ siteKey, next }: { siteKey: string; next: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [confirm, setConfirm] = useState("");
  const [kvkk, setKvkk] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const userInputs = [form.full_name, form.email];
  const pwOk = evaluatePassword(form.password, userInputs).acceptable;
  const mismatch = confirm.length > 0 && confirm !== form.password;
  const confirmOk = confirm.length > 0 && !mismatch;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, kvkk, turnstileToken: token }),
      });
      const json = await res.json();
      if (res.ok) {
        router.push(next === "/hesabim" ? "/giris" : `/giris?next=${encodeURIComponent(next)}`);
        return;
      }
      setError(json.message ?? "Kayıt başarısız.");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  const input = { background: "#fff", minHeight: 44, fontSize: 16 } as const;
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field"><label htmlFor="full_name">Ad Soyad</label><input id="full_name" className="input" required minLength={2} autoComplete="name" value={form.full_name} onChange={set("full_name")} style={input} /></div>
      <div className="field"><label htmlFor="email">E-posta</label><input id="email" className="input" type="email" required autoComplete="email" value={form.email} onChange={set("email")} style={input} /></div>
      <div className="field"><label htmlFor="phone">Telefon (isteğe bağlı)</label><input id="phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} style={input} /></div>
      <div className="field"><label htmlFor="password">Şifre</label><input id="password" className="input" type="password" required autoComplete="new-password" aria-describedby="pw-strength" value={form.password} onChange={set("password")} style={input} /></div>
      <div id="pw-strength"><PasswordStrength password={form.password} userInputs={userInputs} /></div>
      <div className="field"><label htmlFor="password2">Şifre (tekrar)</label><input id="password2" className="input" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} style={input} /></div>
      {mismatch && <FormMessage kind="error">Şifreler eşleşmiyor.</FormMessage>}
      <label style={{ display: "flex", gap: 10, fontSize: 14, alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} required style={{ marginTop: 3 }} />
        <span>Kişisel verilerimin işlenmesine ilişkin <KvkkDialog>KVKK aydınlatma metnini</KvkkDialog> okudum ve kabul ediyorum.</span>
      </label>
      {siteKey && <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken("")} options={{ theme: "light" }} />}
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <button type="submit" disabled={busy || !kvkk || !pwOk || !confirmOk || (!!siteKey && !token)} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: 13 }}>
        <Corners />
        {busy ? "Kaydediliyor…" : "Hesap Oluştur"}
      </button>
      <div style={{ fontSize: 14 }}>Zaten hesabın var mı? <Link href={next === "/hesabim" ? "/giris" : `/giris?next=${encodeURIComponent(next)}`}>Giriş yap</Link></div>
    </form>
  );
}

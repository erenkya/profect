"use client";

import Link from "next/link";
import { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { Corners } from "@/components/Corners";
import { FormMessage } from "./AuthShell";

export function RegisterForm({ siteKey }: { siteKey: string }) {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [kvkk, setKvkk] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
      if (res.ok) setDone(json.message);
      else setError(json.message ?? "Kayıt başarısız.");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormMessage kind="ok">{done}</FormMessage>
        <p style={{ fontSize: 14, color: "var(--muted-72)", margin: 0 }}>E-postayı doğruladıktan sonra giriş yapabilirsiniz. Mesaj gelmediyse spam klasörünü kontrol edin.</p>
        <Link href="/giris" className="btn btn-primary blueprint"><Corners />Giriş sayfasına git</Link>
      </div>
    );
  }

  const input = { background: "#fff", minHeight: 44, fontSize: 16 } as const;
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field"><label htmlFor="full_name">Ad Soyad</label><input id="full_name" className="input" required minLength={2} autoComplete="name" value={form.full_name} onChange={set("full_name")} style={input} /></div>
      <div className="field"><label htmlFor="email">E-posta</label><input id="email" className="input" type="email" required autoComplete="email" value={form.email} onChange={set("email")} style={input} /></div>
      <div className="field"><label htmlFor="phone">Telefon (isteğe bağlı)</label><input id="phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} style={input} /></div>
      <div className="field"><label htmlFor="password">Şifre (en az 8 karakter)</label><input id="password" className="input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set("password")} style={input} /></div>
      <label style={{ display: "flex", gap: 10, fontSize: 14, alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} required style={{ marginTop: 3 }} />
        <span>Kişisel verilerimin işlenmesine ilişkin KVKK aydınlatma metnini okudum ve kabul ediyorum.</span>
      </label>
      {siteKey && <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken("")} options={{ theme: "light" }} />}
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <button type="submit" disabled={busy || !kvkk || (!!siteKey && !token)} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: 13 }}>
        <Corners />
        {busy ? "Kaydediliyor…" : "Hesap Oluştur"}
      </button>
      <div style={{ fontSize: 14 }}>Zaten hesabın var mı? <Link href="/giris">Giriş yap</Link></div>
    </form>
  );
}

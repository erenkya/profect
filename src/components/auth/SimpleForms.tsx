"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Corners } from "@/components/Corners";
import { evaluatePassword } from "@/lib/password-strength";
import { clearPendingPassword, readPendingPassword } from "@/lib/pending-password";
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

/** Onay e-postasındaki bağlantının açtığı ekran. Mail tarayıcıları bağlantıyı önceden açabildiği için değişiklik yalnızca butonla (POST) uygulanır. */
export function ConfirmPasswordChange({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/confirm-password-change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const json = await res.json();
      if (res.ok) setDone(json.message);
      else setError(json.message);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <FormMessage kind="error">Onay bağlantısı eksik. Lütfen e-postadaki bağlantıyı kullanın.</FormMessage>;
  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormMessage kind="ok">{done}</FormMessage>
        <Link href="/giris" className="btn btn-primary blueprint"><Corners />Giriş yap</Link>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>Hesabınızın şifresi, hesap sayfasından belirlediğiniz yeni şifreyle değiştirilecek. Bu talebi siz yaptıysanız onaylayın.</p>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <button type="button" disabled={busy} onClick={confirm} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: 13 }}>
        <Corners />
        {busy ? "Onaylanıyor…" : "Şifre değişikliğini onayla"}
      </button>
      <Link href="/hesabim" style={{ fontSize: 14 }}>Vazgeç</Link>
    </div>
  );
}

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

/** Kayıt/giriş sonrası e-posta doğrulama kodu ekranı. Doğru kodda oturum açılır ve `next`e gidilir. */
export function VerifyEmail({ email, next }: { email: string; next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  // Şifre kayıtta saklanmaz; kayıt formundan buraya taşınır ya da (giriş/başka cihaz) burada belirlenir.
  const [stashed, setStashed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const needPassword = loaded && stashed === null;
  const password = stashed ?? pw;
  const pwOk = evaluatePassword(pw, [email]).acceptable;
  const pwMismatch = pw2.length > 0 && pw2 !== pw;
  const canSubmit = code.length === CODE_LENGTH && (!needPassword || (pwOk && pw2.length > 0 && !pwMismatch)) && loaded;

  useEffect(() => {
    setStashed(readPendingPassword(email));
    setLoaded(true);
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(value: string) {
    if (busy || !password) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/auth/verify-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: value, password }) });
      const json = await res.json();
      if (res.ok) {
        clearPendingPassword();
        router.push(next);
        router.refresh();
        return;
      }
      setError(json.message ?? "Doğrulama başarısız.");
      if (json.field === "password") {
        clearPendingPassword(); // reddedilen şifre yenilemede tekrar denenmesin
        setStashed(null); // taşınan şifre kabul edilmedi: yeniden sor
      }
      setCode("");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResending(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const json = await res.json();
      if (res.ok) {
        setInfo("Yeni doğrulama kodu e-posta adresinize gönderildi.");
        setCode("");
        setCooldown(json.retryAfter ?? RESEND_COOLDOWN_SECONDS);
      } else {
        setError(json.message ?? "Kod gönderilemedi.");
        if (typeof json.retryAfter === "number") setCooldown(json.retryAfter);
      }
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setResending(false);
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    // Şifre kayıttan taşındıysa kod tamamlanınca otomatik gönderilir; şifre burada girilecekse düğmeyle.
    if (digits.length === CODE_LENGTH && stashed) void submit(digits);
  }

  if (!email) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormMessage kind="error">Doğrulanacak e-posta adresi bulunamadı. Lütfen kayıt veya giriş sayfasından devam edin.</FormMessage>
        <Link href="/giris" className="btn btn-secondary">Girişe dön</Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) void submit(code); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
        <strong style={{ wordBreak: "break-all" }}>{email}</strong> adresine {CODE_LENGTH} haneli bir doğrulama kodu gönderdik. Kod {CODE_TTL_MINUTES} dakika geçerlidir.
      </p>
      <div className="field">
        <label htmlFor="code">Doğrulama kodu</label>
        <input
          id="code"
          className="input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH}
          autoFocus
          required
          value={code}
          onChange={onChange}
          placeholder="••••••"
          aria-describedby="code-help"
          style={{ background: "#fff", minHeight: 56, fontSize: 28, letterSpacing: "0.5em", textAlign: "center", fontFamily: "var(--font-mono, monospace)" }}
        />
      </div>
      <div id="code-help" style={{ fontSize: 13, color: "var(--muted-72)" }}>{needPassword ? "Gelmediyse spam klasörünü de kontrol edin." : "Kodu girdiğinizde otomatik doğrulanır. Gelmediyse spam klasörünü de kontrol edin."}</div>
      {needPassword && (
        <>
          <div className="field">
            <label htmlFor="new-password">Şifre belirleyin</label>
            <input id="new-password" className="input" type="password" autoComplete="new-password" aria-describedby="new-pw-strength" value={pw} onChange={(e) => setPw(e.target.value)} style={{ background: "#fff", minHeight: 44, fontSize: 16 }} />
          </div>
          <div id="new-pw-strength"><PasswordStrength password={pw} userInputs={[email]} /></div>
          <div className="field">
            <label htmlFor="new-password2">Şifre (tekrar)</label>
            <input id="new-password2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} aria-invalid={pwMismatch} style={{ background: "#fff", minHeight: 44, fontSize: 16 }} />
          </div>
          {pwMismatch && <FormMessage kind="error">Şifreler eşleşmiyor.</FormMessage>}
        </>
      )}
      {error && <FormMessage kind="error">{error}</FormMessage>}
      {info && <FormMessage kind="ok">{info}</FormMessage>}
      <button type="submit" disabled={busy || !canSubmit} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: 13 }}>
        <Corners />
        {busy ? "Doğrulanıyor…" : "Doğrula"}
      </button>
      <button type="button" className="btn btn-secondary" disabled={resending || cooldown > 0} onClick={resend}>
        {resending ? "Gönderiliyor…" : cooldown > 0 ? `Kodu tekrar gönder (${cooldown} sn)` : "Kodu tekrar gönder"}
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, flexWrap: "wrap", gap: 8 }}>
        <Link href="/kayit">E-postayı değiştir</Link>
        <Link href="/giris">Girişe dön</Link>
      </div>
    </form>
  );
}

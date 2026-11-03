"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { Corners } from "@/components/Corners";
import { evaluatePassword } from "@/lib/password-strength";
import { stashPendingPassword } from "@/lib/pending-password";
import { KvkkDialog } from "@/components/legal/KvkkDialog";
import { FormMessage } from "./AuthShell";
import { PasswordStrength } from "./PasswordStrength";

type AccountType = "bireysel" | "kurumsal";

const TYPES: { id: AccountType; title: string; text: string }[] = [
  { id: "bireysel", title: "Bireysel", text: "Kendiniz için eğitim alın, kendi hızınızda ilerleyin, sertifikanızı alın." },
  { id: "kurumsal", title: "Kurumsal", text: "Şirketiniz için toplu eğitim alın, çalışanlarınıza atayın, ilerlemelerini takip edin." },
];

export function RegisterForm({ siteKey, next, lockedEmail, giftToken }: { siteKey: string; next: string; lockedEmail?: string; giftToken?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: lockedEmail ?? "", phone: "", password: "" });
  // Hediye linkiyle gelen alıcı bireysel kayıt olur (e-posta kilitli); hesap türü seçimi gösterilmez.
  const showTypes = !lockedEmail && !giftToken;
  const [accountType, setAccountType] = useState<AccountType>("bireysel");
  const [company, setCompany] = useState({ company_name: "", tax_office: "", tax_number: "", domain: "" });
  const [companyCode, setCompanyCode] = useState("");
  const [domainMatch, setDomainMatch] = useState<{ name: string; code: string } | null>(null);
  const [useMatch, setUseMatch] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [kvkk, setKvkk] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setC = (k: keyof typeof company) => (e: React.ChangeEvent<HTMLInputElement>) => setCompany((c) => ({ ...c, [k]: e.target.value }));
  const kurumsal = showTypes && accountType === "kurumsal";

  // E-postanın uzantısı bir şirketinkiyle eşleşiyorsa "bu şirkete mi bağlısınız?" sorulur (yalnızca bireysel kayıtta).
  async function lookupDomain(email: string) {
    if (kurumsal || lockedEmail || !email.includes("@")) return;
    try {
      const res = await fetch("/api/company/domain-lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const json = await res.json();
      const match = res.ok && json.found ? { name: json.name as string, code: json.code as string } : null;
      setDomainMatch(match);
      if (!match) {
        if (useMatch) setCompanyCode("");
        setUseMatch(false);
      } else if (useMatch) setCompanyCode(match.code);
    } catch {
      setDomainMatch(null);
    }
  }
  function toggleMatch(checked: boolean) {
    setUseMatch(checked);
    if (domainMatch) setCompanyCode(checked ? domainMatch.code : "");
  }

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
        // Şifre sunucuya gönderilmez: doğrulama adımında e-posta koduyla birlikte gider.
        body: JSON.stringify({
          full_name: form.full_name, email: form.email, phone: form.phone, kvkk, turnstileToken: token, ...(giftToken && { giftToken }),
          ...(showTypes && (accountType === "kurumsal" ? { account_type: "kurumsal", company } : { account_type: "bireysel", company_code: companyCode })),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        stashPendingPassword(json.email ?? form.email, form.password);
        const q = new URLSearchParams({ email: json.email ?? form.email.trim().toLowerCase() });
        // Kurumsal kayıt şirket paneline açılır (kullanıcı başka bir hedef istemediyse).
        if (next !== "/hesabim") q.set("next", next);
        else if (kurumsal) q.set("next", "/sirket");
        router.push(`/e-posta-dogrula?${q}`);
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
      {showTypes && (
        <div role="group" aria-label="Hesap türü" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {TYPES.map((t) => {
            const active = accountType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => setAccountType(t.id)}
                style={{ textAlign: "left", cursor: "pointer", padding: 12, background: active ? "var(--color-accent-100)" : "#fff", border: `${active ? 2 : 1}px solid ${active ? "var(--color-accent)" : "var(--color-divider)"}`, font: "inherit", color: "inherit" }}
              >
                <strong style={{ display: "block", fontSize: 16 }}>{t.title}</strong>
                <span style={{ display: "block", fontSize: 13, marginTop: 4, color: "var(--muted-72)" }}>{t.text}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="field"><label htmlFor="full_name">Ad Soyad</label><input id="full_name" className="input" required minLength={2} autoComplete="name" value={form.full_name} onChange={set("full_name")} style={input} /></div>
      <div className="field"><label htmlFor="email">E-posta</label><input id="email" className="input" type="email" required autoComplete="email" value={form.email} onChange={set("email")} onBlur={(e) => lookupDomain(e.target.value)} readOnly={!!lockedEmail} style={input} />{lockedEmail && <div style={{ fontSize: 13, color: "var(--muted-55)" }}>Hediye bu adrese gönderildi; kayıt yalnızca bu adresle yapılabilir.</div>}</div>
      <div className="field"><label htmlFor="phone">Telefon (isteğe bağlı)</label><input id="phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} style={input} /></div>
      {kurumsal && (
        <>
          <div className="field"><label htmlFor="company_name">Şirket adı</label><input id="company_name" className="input" required minLength={2} autoComplete="organization" value={company.company_name} onChange={setC("company_name")} style={input} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field"><label htmlFor="tax_office">Vergi dairesi</label><input id="tax_office" className="input" required minLength={2} value={company.tax_office} onChange={setC("tax_office")} style={input} /></div>
            <div className="field"><label htmlFor="tax_number">Vergi no</label><input id="tax_number" className="input" required inputMode="numeric" pattern="\d{10}" maxLength={10} value={company.tax_number} onChange={setC("tax_number")} style={input} /></div>
          </div>
          <div className="field">
            <label htmlFor="domain">Şirket mail uzantısı</label>
            <input id="domain" className="input" required placeholder="@sirketiniz.com" value={company.domain} onChange={setC("domain")} style={input} />
            <div style={{ fontSize: 13, color: "var(--muted-55)" }}>E-posta adresiniz bu uzantıyla bitmelidir. Bu uzantıyla kayıt olanlara &ldquo;bu şirkete mi bağlısınız?&rdquo; sorulur.</div>
          </div>
        </>
      )}
      {showTypes && !kurumsal && (
        <>
          {domainMatch && (
            <label style={{ display: "flex", gap: 10, fontSize: 14, alignItems: "flex-start", cursor: "pointer", padding: 10, border: "1px dashed var(--color-divider)", background: "var(--color-accent-100)" }}>
              <input type="checkbox" checked={useMatch} onChange={(e) => toggleMatch(e.target.checked)} style={{ marginTop: 3 }} />
              <span><strong>{domainMatch.name}</strong> şirketine bağlı mısınız? Mail uzantınız bu şirketle eşleşti; işaretlerseniz şirket kodu otomatik girilir.</span>
            </label>
          )}
          <div className="field">
            <label htmlFor="company_code">Şirket kodu (isteğe bağlı)</label>
            <input id="company_code" className="input" autoComplete="off" placeholder="ACME-7K4Q" value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} style={input} />
            {companyCode.trim() && <div style={{ fontSize: 13, color: "var(--muted-55)" }}>Kodu girerseniz şirket yöneticisinin onayından sonra şirkete bağlanırsınız. O zamana kadar bireysel hesap olarak devam edersiniz.</div>}
          </div>
        </>
      )}
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
        {busy ? "Kaydediliyor…" : kurumsal ? "Şirket hesabı oluştur" : "Hesap Oluştur"}
      </button>
      <div style={{ fontSize: 14 }}>Zaten hesabın var mı? <Link href={next === "/hesabim" ? "/giris" : `/giris?next=${encodeURIComponent(next)}`}>Giriş yap</Link></div>
    </form>
  );
}

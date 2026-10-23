"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Corners } from "@/components/Corners";
import { FormMessage } from "@/components/auth/AuthShell";
import { KvkkDialog } from "@/components/legal/KvkkDialog";
import { CheckoutPrivacyContent, DeliveryReturnContent, DistanceSalesContent } from "@/components/legal/CheckoutLegalContent";
import { CONSENT_KEYS, billingSchema, cardSchema, type ConsentKey } from "@/lib/checkout-schema";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { CartLines } from "./CartLines";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { useQuote } from "./useQuote";

type Defaults = { full_name: string; email: string; phone: string };
type Errors = Record<string, string>;

const input = { background: "#fff", minHeight: 44, fontSize: 16 } as const;
const BUTTON_LABEL = { manual: "Siparişi oluştur", mock: "Öde (test modu)", tami: "Öde" } as const;

function groupCard(v: string) {
  return v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
}
function formatExpiry(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function CheckoutForm({ defaults }: { defaults: Defaults }) {
  const router = useRouter();
  const { items, ready } = useCart();
  const q = useQuote(items, ready);

  const [invoiceType, setInvoiceType] = useState<"bireysel" | "kurumsal">("bireysel");
  const [f, setF] = useState({ ...defaults, tckn: "", company_name: "", tax_office: "", tax_number: "", address: "", city: "", district: "", zip_code: "" });
  const [card, setCard] = useState({ holder_name: "", number: "", expiry: "", cvv: "" });
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({ distance_sales: false, privacy: false, delivery_return: false, kvkk: false });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setConsent = (k: ConsentKey) => (v: boolean) => setConsents((c) => ({ ...c, [k]: v }));
  const allConsents = CONSENT_KEYS.every((k) => consents[k]);
  const needsCard = q.provider === "tami";

  if (!ready || q.loading) return <p style={{ color: "var(--muted-72)" }} aria-live="polite">Sipariş özetin yükleniyor…</p>;
  if (items.length === 0 || q.payable.length === 0) {
    return (
      <div className="card blueprint" style={{ background: "#fff", padding: 32, gap: 14, alignItems: "flex-start" }}>
        <Corners />
        <div className="dialog-title" style={{ fontSize: 26, textTransform: "uppercase" }}>Ödenecek ürün yok</div>
        <p style={{ margin: 0, color: "var(--muted-72)" }}>Sepetin boş ya da içindeki ürünlere zaten erişimin var.</p>
        <Link href="/sepet" className="btn btn-secondary">Sepete dön</Link>
      </div>
    );
  }
  if (q.failed) return <p role="alert" style={{ color: "var(--color-accent-2-700)" }}>Sipariş özeti yüklenemedi. Sayfayı yenileyip tekrar dene.</p>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const billing = invoiceType === "bireysel"
      ? { invoice_type: invoiceType, full_name: f.full_name, email: f.email, phone: f.phone, address: f.address, city: f.city, district: f.district, zip_code: f.zip_code, tckn: f.tckn }
      : { invoice_type: invoiceType, full_name: f.full_name, email: f.email, phone: f.phone, address: f.address, city: f.city, district: f.district, zip_code: f.zip_code, company_name: f.company_name, tax_office: f.tax_office, tax_number: f.tax_number };

    const errs: Errors = {};
    const b = billingSchema.safeParse(billing);
    if (!b.success) for (const i of b.error.issues) errs[String(i.path[0])] ??= i.message;
    if (needsCard) {
      const c = cardSchema.safeParse(card);
      if (!c.success) for (const i of c.error.issues) errs[`card.${String(i.path[0])}`] ??= i.message;
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById("checkout-form")?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, billing, consents, ...(needsCard && { card }) }),
      });
      const json = await res.json();
      if (!res.ok) return setError(json.message ?? "Sipariş oluşturulamadı.");
      if (json.status === "redirect") {
        // Banka 3D Secure sayfası: dönen HTML kendini otomatik submit eder, bu yüzden üst seviyede yazılır.
        document.open();
        document.write(json.threeDSHtmlContent);
        document.close();
        return;
      }
      router.push(`/odeme/sonuc?orderId=${json.orderId}`);
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  const field = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={`co-${k}`}>{label}</label>
      <input id={`co-${k}`} className="input" value={f[k]} onChange={set(k)} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `co-${k}-err` : undefined} style={input} {...props} />
      {errors[k] && <div id={`co-${k}-err`} role="alert" className="field-err">{errors[k]}</div>}
    </div>
  );

  return (
    <form id="checkout-form" onSubmit={onSubmit} noValidate className="checkout-grid">
      <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
        <section className="card blueprint" style={{ background: "#fff", padding: 24, gap: 14 }}>
          <Corners />
          <h2 className="co-h">Fatura bilgileri</h2>
          <div role="radiogroup" aria-label="Fatura türü" className="seg" style={{ alignSelf: "flex-start" }}>
            {(["bireysel", "kurumsal"] as const).map((t) => (
              <label key={t} className="seg-opt">
                <input type="radio" name="invoice_type" value={t} checked={invoiceType === t} onChange={() => setInvoiceType(t)} />
                {t === "bireysel" ? "Bireysel" : "Kurumsal"}
              </label>
            ))}
          </div>
          {field("full_name", "Ad soyad", { autoComplete: "name" })}
          <div className="co-two">
            {field("email", "E-posta", { type: "email", autoComplete: "email" })}
            {field("phone", "Cep telefonu", { type: "tel", autoComplete: "tel", placeholder: "5XX XXX XX XX" })}
          </div>
          {invoiceType === "bireysel" ? (
            field("tckn", "TC kimlik no", { inputMode: "numeric", maxLength: 11, autoComplete: "off" })
          ) : (
            <>
              {field("company_name", "Şirket unvanı", { autoComplete: "organization" })}
              <div className="co-two">
                {field("tax_office", "Vergi dairesi")}
                {field("tax_number", "Vergi numarası", { inputMode: "numeric", maxLength: 10 })}
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="co-address">Adres</label>
            <textarea id="co-address" className="input" rows={3} value={f.address} onChange={set("address")} autoComplete="street-address" aria-invalid={!!errors.address} style={{ ...input, minHeight: 80 }} />
            {errors.address && <div role="alert" className="field-err">{errors.address}</div>}
          </div>
          <div className="co-three">
            {field("city", "İl", { autoComplete: "address-level1" })}
            {field("district", "İlçe", { autoComplete: "address-level2" })}
            {field("zip_code", "Posta kodu", { inputMode: "numeric", maxLength: 5, autoComplete: "postal-code" })}
          </div>
        </section>

        <section className="card blueprint" style={{ background: "#fff", padding: 24, gap: 14 }}>
          <Corners />
          <h2 className="co-h">Ödeme</h2>
          {needsCard ? (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted-55)", display: "flex", gap: 6, alignItems: "center" }}>
                <Lock size={14} aria-hidden /> Kart bilgilerin saklanmaz; 3D Secure ile bankanda doğrulanır.
              </p>
              <div className="field">
                <label htmlFor="co-card-name">Kart üzerindeki isim</label>
                <input id="co-card-name" className="input" autoComplete="cc-name" value={card.holder_name} onChange={(e) => setCard((c) => ({ ...c, holder_name: e.target.value }))} aria-invalid={!!errors["card.holder_name"]} style={input} />
                {errors["card.holder_name"] && <div role="alert" className="field-err">{errors["card.holder_name"]}</div>}
              </div>
              <div className="field">
                <label htmlFor="co-card-no">Kart numarası</label>
                <input id="co-card-no" className="input" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number} onChange={(e) => setCard((c) => ({ ...c, number: groupCard(e.target.value) }))} aria-invalid={!!errors["card.number"]} style={input} />
                {errors["card.number"] && <div role="alert" className="field-err">{errors["card.number"]}</div>}
              </div>
              <div className="co-two">
                <div className="field">
                  <label htmlFor="co-card-exp">Son kullanma</label>
                  <input id="co-card-exp" className="input" inputMode="numeric" autoComplete="cc-exp" placeholder="AA/YY" value={card.expiry} onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))} aria-invalid={!!errors["card.expiry"]} style={input} />
                  {errors["card.expiry"] && <div role="alert" className="field-err">{errors["card.expiry"]}</div>}
                </div>
                <div className="field">
                  <label htmlFor="co-card-cvv">CVC</label>
                  <input id="co-card-cvv" className="input" inputMode="numeric" autoComplete="cc-csc" maxLength={4} placeholder="000" value={card.cvv} onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, "") }))} aria-invalid={!!errors["card.cvv"]} style={input} />
                  {errors["card.cvv"] && <div role="alert" className="field-err">{errors["card.cvv"]}</div>}
                </div>
              </div>
            </>
          ) : q.provider === "mock" ? (
            <FormMessage kind="ok">Test modu: ödeme alınmaz, sipariş anında “ödendi” sayılır ve erişim açılır.</FormMessage>
          ) : (
            <p style={{ margin: 0, fontSize: 15, color: "var(--muted-72)" }}>
              Online kart ödemesi çok yakında. Şimdilik <strong style={{ fontWeight: 600 }}>ödeme alınmaz</strong>: siparişin “onay bekliyor” olarak kaydedilir, ödeme onaylandığında erişimin açılır ve e-posta ile bilgilendirilirsin.
            </p>
          )}
        </section>

        <section className="card blueprint" style={{ background: "#fff", padding: 24, gap: 12 }}>
          <Corners />
          <h2 className="co-h">Onaylar</h2>
          <ConsentCheckbox id="consent-distance-sales" checked={consents.distance_sales} onChange={setConsent("distance_sales")} linkText="Mesafeli Satış Sözleşmesi" suffix="’ni okudum ve kabul ediyorum." title="Mesafeli Satış Sözleşmesi">
            <DistanceSalesContent />
          </ConsentCheckbox>
          <ConsentCheckbox id="consent-privacy" checked={consents.privacy} onChange={setConsent("privacy")} linkText="Gizlilik ve Güvenlik Sözleşmesi" suffix="’ni okudum ve kabul ediyorum." title="Gizlilik ve Güvenlik Sözleşmesi">
            <CheckoutPrivacyContent />
          </ConsentCheckbox>
          <ConsentCheckbox id="consent-delivery-return" checked={consents.delivery_return} onChange={setConsent("delivery_return")} linkText="Teslimat, İade ve İptal Koşulları" suffix="’nı okudum ve kabul ediyorum." title="Teslimat, İade ve İptal Koşulları">
            <DeliveryReturnContent />
          </ConsentCheckbox>
          <label htmlFor="consent-kvkk" style={{ display: "flex", gap: 10, fontSize: 14, alignItems: "flex-start", cursor: "pointer" }}>
            <input id="consent-kvkk" type="checkbox" checked={consents.kvkk} onChange={(e) => setConsent("kvkk")(e.target.checked)} required style={{ marginTop: 3 }} />
            <span>Kişisel verilerimin işlenmesine ilişkin <KvkkDialog>KVKK aydınlatma metnini</KvkkDialog> okudum ve kabul ediyorum.</span>
          </label>
        </section>
      </div>

      <aside className="card blueprint elev-md checkout-summary" style={{ background: "#fff", padding: 24, gap: 14 }}>
        <Corners />
        <div className="dialog-title" style={{ fontSize: 24, textTransform: "uppercase" }}>Sipariş özeti</div>
        <CartLines lines={q.lines} />
        <div className="sum-row sum-total"><span>Toplam (KDV dahil)</span><span>{formatPrice(q.total)}</span></div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <button type="submit" disabled={busy || !allConsents} className="btn btn-primary blueprint btn-block" style={{ fontSize: 18, padding: 14 }}>
          <Corners />
          {busy ? "İşleniyor…" : q.provider === "tami" ? `${formatPrice(q.total)} öde` : BUTTON_LABEL[q.provider]}
        </button>
        {!allConsents && <div style={{ fontSize: 13, color: "var(--muted-55)", textAlign: "center" }}>Devam etmek için dört onayın tümünü işaretle.</div>}
        <Link href="/sepet" style={{ fontSize: 14, textAlign: "center" }}>← Sepete dön</Link>
      </aside>
    </form>
  );
}

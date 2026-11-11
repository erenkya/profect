"use client";

import Link from "next/link";
import "@/components/checkout/checkout.css";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Corners } from "@/components/Corners";
import { FormMessage } from "@/components/auth/AuthShell";
import { KvkkDialog } from "@/components/legal/KvkkDialog";
import { CheckoutPrivacyContent, DeliveryReturnContent, DistanceSalesContent } from "@/components/legal/CheckoutLegalContent";
import { CARD_BRAND_ICON, CARD_BRAND_LABEL, cvcLength, detectCardBrand, formatCardNumber, formatExpiry, isValidExpiry } from "@/lib/card-brand";
import { CONSENT_KEYS, billingSchema, cardSchema, type ConsentKey } from "@/lib/checkout-schema";
import { giftCheckoutSchema } from "@/lib/gift-rules";
import { SEAT_MAX_QUANTITY, seatQuantitySchema } from "@/lib/seat-quantity";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { VAT_PERCENT, withVat } from "@/lib/vat";
import { CartLines } from "./CartLines";
import { GiftRecipientFields } from "./GiftRecipientFields";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { CardPreview, type CardField } from "./CardPreview";
import { PaymentBadges } from "./PaymentBadges";
import { useQuote } from "./useQuote";

type Defaults = { full_name: string; email: string; phone: string };
/** Hediye modu: tek kurs ya da program, sepet/kupon yok; sipariş /api/gifts/checkout'a gider. */
type GiftCheckout = { kind: "course" | "program"; slug: string; title: string; price: number; provider: "manual" | "mock" | "tami" };
/** Şirket kontenjanı modu: tek kurs × adet, kupon/sepet yok; sipariş /api/company/<id>/checkout'a gider. */
type SeatsCheckout = { kind?: "course" | "program"; companyId: number; slug: string; title: string; unitPrice: number; provider: "manual" | "mock" | "tami"; company?: { name: string; tax_office: string; tax_number: string } };
type Errors = Record<string, string>;

const input = { background: "#fff", minHeight: 44, fontSize: 16 } as const;
const BUTTON_LABEL = { manual: "Siparişi oluştur", mock: "Öde (test modu)", tami: "Öde" } as const;

export function CheckoutForm({ defaults, gift, seats }: { defaults: Defaults; gift?: GiftCheckout; seats?: SeatsCheckout }) {
  const router = useRouter();
  const cart = useCart();
  const solo = !!(gift || seats); // hediye ve kontenjan modunda sepet kullanılmaz
  const items = solo ? [] : cart.items;
  const ready = solo ? true : cart.ready;
  const q = useQuote(items, ready);
  const provider = gift ? gift.provider : seats ? seats.provider : q.provider;
  const [quantity, setQuantity] = useState("1");
  const [recipient, setRecipient] = useState({ email: "", message: "" });

  const [invoiceType, setInvoiceType] = useState<"bireysel" | "kurumsal">(seats ? "kurumsal" : "bireysel");
  const [f, setF] = useState({ ...defaults, company_name: seats?.company?.name ?? "", tax_office: seats?.company?.tax_office ?? "", tax_number: seats?.company?.tax_number ?? "", address: "", city: "", district: "", zip_code: "" });
  const [card, setCard] = useState({ holder_name: "", number: "", expiry: "", cvv: "" });
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({ distance_sales: false, privacy: false, delivery_return: false, kvkk: false });
  const [cardFocus, setCardFocus] = useState<CardField | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; label: string; subtotal: number; discount: number; total: number } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setConsent = (k: ConsentKey) => (v: boolean) => setConsents((c) => ({ ...c, [k]: v }));
  const allConsents = CONSENT_KEYS.every((k) => consents[k]);
  const qty = Number(quantity);
  const qtyOk = seatQuantitySchema.safeParse(qty).success;
  const seatsTotal = seats && qtyOk ? Math.round(seats.unitPrice * qty * 100) / 100 : 0;
  const effTotal = gift ? gift.price : seats ? seatsTotal : coupon ? coupon.total : q.total; // KDV hariç
  const pay = withVat(effTotal);
  const needsCard = provider === "tami" && pay.gross > 0;
  const brand = detectCardBrand(card.number);
  const expiryProblem = card.expiry.length === 5 && !isValidExpiry(card.expiry) ? "Kartın son kullanma tarihi geçmiş ya da geçersiz." : "";
  const fp = (f: CardField) => ({ onFocus: () => setCardFocus(f), onBlur: () => setCardFocus(null) });

  if (!ready || q.loading) return <p style={{ color: "var(--muted-72)" }} aria-live="polite">Sipariş özetin yükleniyor…</p>;
  if (!solo && (items.length === 0 || q.payable.length === 0)) {
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

  async function applyCoupon() {
    if (couponBusy || !couponInput.trim()) return;
    setCouponBusy(true);
    setCouponError("");
    try {
      const res = await fetch("/api/checkout/coupon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: couponInput, items }) });
      const json = await res.json();
      if (!res.ok) return setCouponError(json.message ?? "Kupon uygulanamadı.");
      setCoupon({ code: json.coupon.code, label: json.coupon.label, subtotal: json.subtotal, discount: json.discount, total: json.total });
      setCouponInput("");
    } catch {
      setCouponError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setCouponBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const billing = invoiceType === "bireysel"
      ? { invoice_type: invoiceType, full_name: f.full_name, email: f.email, phone: f.phone }
      : { invoice_type: invoiceType, full_name: f.full_name, email: f.email, phone: f.phone, address: f.address, city: f.city, district: f.district, zip_code: f.zip_code, company_name: f.company_name, tax_office: f.tax_office, tax_number: f.tax_number };

    const errs: Errors = {};
    const b = billingSchema.safeParse(billing);
    if (!b.success) for (const i of b.error.issues) errs[String(i.path[0])] ??= i.message;
    if (needsCard) {
      const c = cardSchema.safeParse(card);
      if (!c.success) for (const i of c.error.issues) errs[`card.${String(i.path[0])}`] ??= i.message;
    }
    if (gift) {
      const g = giftCheckoutSchema.shape;
      const re = g.recipient_email.safeParse(recipient.email);
      if (!re.success) errs.recipient_email = re.error.issues[0].message;
      const me = g.message.safeParse(recipient.message);
      if (!me.success) errs.message = me.error.issues[0].message;
    }
    if (seats) {
      const qe = seatQuantitySchema.safeParse(qty);
      if (!qe.success) errs.quantity = qe.error.issues[0].message;
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById("checkout-form")?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(gift ? "/api/gifts/checkout" : seats ? `/api/company/${seats.companyId}/checkout` : "/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          gift
            ? { kind: gift.kind, slug: gift.slug, recipient_email: recipient.email, message: recipient.message, billing, consents, ...(needsCard && { card }) }
            : seats
            ? { kind: seats.kind ?? "course", slug: seats.slug, quantity: qty, billing, consents, ...(needsCard && { card }) }
            : { items, billing, consents, ...(needsCard && { card }), ...(coupon && { coupon_code: coupon.code }) },
        ),
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
        {seats && (
          <section className="card blueprint" style={{ background: "#fff", padding: 24, gap: 10 }}>
            <div className="field">
              <label htmlFor="co-quantity">Kaç kişilik kontenjan?</label>
              <input id="co-quantity" className="input" type="number" inputMode="numeric" min={1} max={SEAT_MAX_QUANTITY} step={1} value={quantity} onChange={(e) => { setQuantity(e.target.value); setErrors((s) => ({ ...s, quantity: "" })); }} aria-invalid={!!errors.quantity} aria-describedby="co-quantity-hint" style={{ ...input, maxWidth: 160 }} />
              {errors.quantity && <div role="alert" className="field-err">{errors.quantity}</div>}
              <div id="co-quantity-hint" style={{ fontSize: 13, color: "var(--muted-55)" }}>Satın aldığınız {seats.kind === "program" ? "program kontenjanını" : "kontenjanı"} şirket panelinden çalışanlarınıza atarsınız. Birim fiyat: {formatPrice(seats.unitPrice)} + KDV</div>
            </div>
          </section>
        )}
        {gift && <GiftRecipientFields email={recipient.email} message={recipient.message} onEmail={(v) => setRecipient((r) => ({ ...r, email: v }))} onMessage={(v) => setRecipient((r) => ({ ...r, message: v }))} errors={errors} />}
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
          {field("email", "E-posta", { type: "email", autoComplete: "email" })}
          {field("phone", invoiceType === "kurumsal" ? "Cep telefonu" : "Cep telefonu (isteğe bağlı)", { type: "tel", autoComplete: "tel", placeholder: "5XX XXX XX XX" })}
          {invoiceType === "kurumsal" && (
            <>
              {field("company_name", "Şirket unvanı", { autoComplete: "organization" })}
              <div className="co-two">
                {field("tax_office", "Vergi dairesi")}
                {field("tax_number", "Vergi numarası", { inputMode: "numeric", maxLength: 10 })}
              </div>
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
            </>
          )}
        </section>

        <section className="card blueprint" style={{ background: "#fff", padding: 24, gap: 14 }}>
          <Corners />
          <h2 className="co-h">Ödeme</h2>
          {needsCard ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted-55)", display: "flex", gap: 6, alignItems: "center" }}>
              <Lock size={14} aria-hidden /> Kart bilgilerin saklanmaz; 3D Secure ile bankanda doğrulanır.
            </p>
          ) : provider === "mock" ? (
            <FormMessage kind="ok">Test modu: ödeme alınmaz, sipariş anında “ödendi” sayılır ve erişim açılır. Kart bilgileri hiçbir yere gönderilmez.</FormMessage>
          ) : null}
          {pay.gross <= 0 ? (
            <FormMessage kind="ok">Kuponla bu sipariş için ödeme gerekmiyor; siparişi tamamladığında erişimin hemen açılır.</FormMessage>
          ) : needsCard ? (
            <div className="pay-row">
              <div className="card-fields">
              <div className="field">
                <label htmlFor="co-card-name">Kart üzerindeki isim</label>
                <input id="co-card-name" {...fp("name")} className="input" autoComplete={needsCard ? "cc-name" : "off"} value={card.holder_name} maxLength={40} onChange={(e) => setCard((c) => ({ ...c, holder_name: e.target.value.replace(/[^\p{L}\s.'’-]/gu, "") }))} aria-invalid={!!errors["card.holder_name"]} style={input} />
                {errors["card.holder_name"] && <div role="alert" className="field-err">{errors["card.holder_name"]}</div>}
              </div>
              <div className="field">
                <label htmlFor="co-card-no">Kart numarası</label>
                <div style={{ position: "relative" }}>
                  <input id="co-card-no" {...fp("number")} className="input" inputMode="numeric" autoComplete={needsCard ? "cc-number" : "off"} placeholder="0000 0000 0000 0000" value={card.number} onChange={(e) => setCard((c) => ({ ...c, number: formatCardNumber(e.target.value) }))} aria-invalid={!!errors["card.number"]} style={{ ...input, paddingRight: 64 }} />
                  <span className="card-brand" aria-live="polite">
                    {brand && <img src={CARD_BRAND_ICON[brand].src} width={CARD_BRAND_ICON[brand].w} height={CARD_BRAND_ICON[brand].h} alt={CARD_BRAND_LABEL[brand]} />}
                  </span>
                </div>
                {errors["card.number"] && <div role="alert" className="field-err">{errors["card.number"]}</div>}
              </div>
              <div className="co-two">
                <div className="field">
                  <label htmlFor="co-card-exp">Son kullanma</label>
                  <input id="co-card-exp" {...fp("expiry")} className="input" inputMode="numeric" autoComplete={needsCard ? "cc-exp" : "off"} placeholder="AA/YY" value={card.expiry} onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))} aria-invalid={!!(expiryProblem || errors["card.expiry"])} style={input} />
                  {(expiryProblem || errors["card.expiry"]) && <div role="alert" className="field-err">{expiryProblem || errors["card.expiry"]}</div>}
                </div>
                <div className="field">
                  <label htmlFor="co-card-cvv">CVC</label>
                  <input id="co-card-cvv" {...fp("cvv")} className="input" inputMode="numeric" autoComplete={needsCard ? "cc-csc" : "off"} maxLength={cvcLength(brand)} placeholder={brand === "amex" ? "0000" : "000"} value={card.cvv} onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, "").slice(0, cvcLength(brand)) }))} aria-invalid={!!errors["card.cvv"]} style={input} />
                  {errors["card.cvv"] && <div role="alert" className="field-err">{errors["card.cvv"]}</div>}
                </div>
              </div>
              </div>
              <CardPreview number={card.number} name={card.holder_name} expiry={card.expiry} cvv={card.cvv} focus={cardFocus} />
            </div>
          ) : provider === "manual" ? (
            <FormMessage kind="ok">Siparişini oluşturduktan sonra seninle iletişime geçeceğiz. Ödemeyi aldıktan sonra eğitimini hesabına tanımlayacağız.</FormMessage>
          ) : null}
        </section>
      </div>

      <aside className="card blueprint elev-md checkout-summary" style={{ background: "#fff", padding: 24, gap: 14 }}>
        <Corners />
        <div className="dialog-title" style={{ fontSize: 24, textTransform: "uppercase" }}>Sipariş özeti</div>
        {gift ? <div className="sum-row"><span>{gift.title}</span><span>{formatPrice(gift.price)}</span></div> : seats ? <div className="sum-row"><span>{seats.title} × {qtyOk ? qty : "—"} kişilik {seats.kind === "program" ? "program " : ""}kontenjan</span><span>{formatPrice(seatsTotal)}</span></div> : <CartLines lines={q.lines} />}
        {!solo && <div className="co-coupon">
          {coupon ? (
            <div className="co-coupon-applied" role="status">
              <span><strong>{coupon.code}</strong> uygulandı · {coupon.label}</span>
              <button type="button" onClick={() => { setCoupon(null); setCouponError(""); }} aria-label="Kuponu kaldır">Kaldır</button>
            </div>
          ) : (
            <>
              <label htmlFor="co-coupon-input" className="co-coupon-label">Kupon kodu</label>
              <div className="co-coupon-row">
                <input
                  id="co-coupon-input"
                  className="input"
                  value={couponInput}
                  onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                  placeholder="Varsa kodu gir"
                  autoComplete="off"
                  maxLength={60}
                  aria-invalid={!!couponError}
                  style={{ background: "#fff", minHeight: 40 }}
                />
                <button type="button" className="btn btn-secondary" onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()} style={{ padding: "8px 14px" }}>{couponBusy ? "…" : "Uygula"}</button>
              </div>
              {couponError && <div role="alert" className="field-err">{couponError}</div>}
            </>
          )}
        </div>}
        {coupon && (
          <>
            <div className="sum-row"><span>Ara toplam</span><span>{formatPrice(coupon.subtotal)}</span></div>
            <div className="sum-row" style={{ color: "#1d8a55" }}><span>Kupon indirimi</span><span>−{formatPrice(coupon.discount)}</span></div>
          </>
        )}
        {pay.gross > 0 && (
          <>
            <div className="sum-row"><span>Tutar (KDV hariç)</span><span>{formatPrice(pay.net)}</span></div>
            <div className="sum-row"><span>KDV (%{VAT_PERCENT})</span><span>{formatPrice(pay.vat)}</span></div>
          </>
        )}
        <div className="sum-row sum-total"><span>Toplam (KDV dahil)</span><span>{formatPrice(pay.gross)}</span></div>
        <div className="co-consents" style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--color-divider)", paddingTop: 14 }}>
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
        </div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <button type="submit" disabled={busy || !allConsents} className="btn btn-primary blueprint btn-block" style={{ fontSize: 18, padding: 14 }}>
          <Corners />
          {busy ? "İşleniyor…" : pay.gross <= 0 ? "Siparişi tamamla (ücretsiz)" : provider === "tami" ? `${formatPrice(pay.gross)} öde` : gift ? "Hediyeyi satın al" : seats ? (seats.kind === "program" ? "Program kontenjanını satın al" : "Kontenjanı satın al") : BUTTON_LABEL[provider]}
        </button>
        {!allConsents && <div style={{ fontSize: 13, color: "var(--muted-55)", textAlign: "center" }}>Devam etmek için dört onayın tümünü işaretle.</div>}
        {needsCard && <PaymentBadges secured />}
        {seats ? <Link href="/sirket" style={{ fontSize: 14, textAlign: "center" }}>← Şirket paneline dön</Link> : gift ? <Link href={gift.kind === "program" ? `/programlar/${gift.slug}` : `/kurslar/${gift.slug}`} style={{ fontSize: 14, textAlign: "center" }}>{gift.kind === "program" ? "← Programa dön" : "← Kursa dön"}</Link> : <Link href="/sepet" style={{ fontSize: 14, textAlign: "center" }}>← Sepete dön</Link>}
      </aside>
    </form>
  );
}

"use client";

import { Corners } from "@/components/Corners";
import { GIFT_MESSAGE_MAX } from "@/lib/gift-rules";

const input = { background: "#fff", minHeight: 44, fontSize: 16 } as const;

/** Hediye ödemesinin "Alıcı" kartı: hediyenin gideceği e-posta adresi ve isteğe bağlı kısa not. */
export function GiftRecipientFields(p: {
  email: string;
  message: string;
  onEmail: (v: string) => void;
  onMessage: (v: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <section className="card blueprint" style={{ background: "#fff", padding: 24, gap: 14 }}>
      <Corners />
      <h2 className="co-h">Hediyenin alıcısı</h2>
      <div className="field">
        <label htmlFor="gift-email">Alıcının e-posta adresi</label>
        <input id="gift-email" className="input" type="email" autoComplete="off" value={p.email} onChange={(e) => p.onEmail(e.target.value)} aria-invalid={!!p.errors.recipient_email} style={input} />
        {p.errors.recipient_email && <div role="alert" className="field-err">{p.errors.recipient_email}</div>}
        <div style={{ fontSize: 13, color: "var(--muted-55)" }}>Hediye yalnızca bu adresle alınabilir. Alıcının hesabı yoksa bu adresle kayıt olması istenir.</div>
      </div>
      <div className="field">
        <label htmlFor="gift-message">Not (isteğe bağlı)</label>
        <textarea id="gift-message" className="input" rows={3} maxLength={GIFT_MESSAGE_MAX} value={p.message} onChange={(e) => p.onMessage(e.target.value)} aria-invalid={!!p.errors.message} style={{ ...input, minHeight: 80 }} />
        <div style={{ fontSize: 13, color: "var(--muted-55)", textAlign: "right" }}>{p.message.length}/{GIFT_MESSAGE_MAX}</div>
        {p.errors.message && <div role="alert" className="field-err">{p.errors.message}</div>}
      </div>
    </section>
  );
}

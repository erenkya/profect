"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shuffle } from "lucide-react";
import { Toast, useFlash } from "./Toast";
import { adminApi } from "./api";
import { describeDiscount, generateCouponCode } from "@/lib/coupon-schema";
import { formatPrice } from "@/lib/format";

export type CouponRowView = {
  id: number; code: string; discount_type: "percentage" | "fixed"; discount_value: number; max_uses: number | null; max_uses_per_user: number | null;
  is_active: boolean; valid_from: string | null; valid_until: string | null; expired: boolean; uses: number; total_discount: number;
};

const EMPTY = { code: "", discount_type: "percentage", discount_value: "", valid_from: "", valid_until: "", max_uses: "", max_uses_per_user: "" };
const input = { background: "#fff" } as const;

export function CouponsPanel({ coupons }: { coupons: CouponRowView[] }) {
  const router = useRouter();
  const [flash, setFlash] = useFlash();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await adminApi("POST", "/api/admin/coupons", f);
    setBusy(false);
    setFlash({ kind: r.ok ? "ok" : "error", text: r.message });
    if (r.ok) {
      setF(EMPTY);
      router.refresh();
    }
  }
  async function toggle(c: CouponRowView) {
    const r = await adminApi("PATCH", `/api/admin/coupons/${c.id}`, { is_active: !c.is_active });
    setFlash({ kind: r.ok ? "ok" : "error", text: r.message });
    if (r.ok) router.refresh();
  }
  async function remove(c: CouponRowView) {
    if (!confirm(`${c.code} kuponu silinsin mi?`)) return;
    const r = await adminApi("DELETE", `/api/admin/coupons/${c.id}`);
    setFlash({ kind: r.ok ? "ok" : "error", text: r.message });
    if (r.ok) router.refresh();
  }

  return (
    <>
      <Toast flash={flash} onClose={() => setFlash(null)} />
      <form onSubmit={create} className="card blueprint" style={{ background: "#fff", padding: 24, gap: 14, marginBottom: 28 }}>
        <h2 style={{ fontSize: 24, textTransform: "uppercase", margin: 0 }}>Yeni kupon</h2>
        <div className="coupon-form-grid">
          <div className="field">
            <label htmlFor="cp-code">Kupon kodu</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="cp-code" className="input" required value={f.code} onChange={(e) => setF((s) => ({ ...s, code: e.target.value.toUpperCase() }))} placeholder="YAZ20" maxLength={40} style={input} autoComplete="off" />
              <button type="button" className="btn btn-secondary btn-icon" aria-label="Rastgele kod üret" title="Rastgele kod üret" onClick={() => setF((s) => ({ ...s, code: generateCouponCode() }))}><Shuffle size={16} aria-hidden /></button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="cp-type">İndirim türü</label>
            <select id="cp-type" className="input" value={f.discount_type} onChange={set("discount_type")} style={input}>
              <option value="percentage">Yüzde (%)</option>
              <option value="fixed">Sabit tutar (₺)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="cp-value">{f.discount_type === "percentage" ? "İndirim yüzdesi" : "İndirim tutarı (₺)"}</label>
            <input id="cp-value" className="input" required inputMode="decimal" type="number" min="0.01" max={f.discount_type === "percentage" ? 100 : undefined} step={f.discount_type === "percentage" ? 1 : 0.01} value={f.discount_value} onChange={set("discount_value")} style={input} />
          </div>
          <div className="field"><label htmlFor="cp-from">Başlangıç (isteğe bağlı)</label><input id="cp-from" className="input" type="date" value={f.valid_from} onChange={set("valid_from")} style={input} /></div>
          <div className="field"><label htmlFor="cp-until">Bitiş (isteğe bağlı)</label><input id="cp-until" className="input" type="date" value={f.valid_until} min={f.valid_from || undefined} onChange={set("valid_until")} style={input} /></div>
          <div className="field"><label htmlFor="cp-max">Toplam kullanım limiti</label><input id="cp-max" className="input" type="number" min="1" step="1" placeholder="Sınırsız" value={f.max_uses} onChange={set("max_uses")} style={input} /></div>
          <div className="field"><label htmlFor="cp-user">Kişi başı limit</label><input id="cp-user" className="input" type="number" min="1" step="1" placeholder="Sınırsız" value={f.max_uses_per_user} onChange={set("max_uses_per_user")} style={input} /></div>
        </div>
        <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Oluşturuluyor…" : "Kuponu oluştur"}</button></div>
      </form>

      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>Kod</th><th>İndirim</th><th>Geçerlilik</th><th>Kullanım</th><th>Toplam indirim</th><th>Durum</th><th /></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td><strong style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{c.code}</strong></td>
                <td>{describeDiscount(c.discount_type, c.discount_value)}</td>
                <td>{c.valid_from || c.valid_until ? `${c.valid_from ?? "…"} → ${c.valid_until ?? "…"}` : "Süresiz"}</td>
                <td>{c.uses}{c.max_uses ? ` / ${c.max_uses}` : ""}{c.max_uses_per_user ? <span style={{ color: "var(--muted-55)" }}> · kişi başı {c.max_uses_per_user}</span> : null}</td>
                <td>{formatPrice(c.total_discount)}</td>
                <td><span className={`tag ${c.is_active && !c.expired ? "tag-accent" : "tag-neutral"}`}>{c.expired ? "Süresi doldu" : c.is_active ? "Aktif" : "Pasif"}</span></td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => toggle(c)}>{c.is_active ? "Pasife al" : "Aktif et"}</button>
                  {c.uses === 0 && <button className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 13 }} onClick={() => remove(c)}>Sil</button>}
                </td>
              </tr>
            ))}
            {coupons.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted-55)" }}>Henüz kupon yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

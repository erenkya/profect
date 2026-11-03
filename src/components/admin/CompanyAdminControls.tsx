"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast, useFlash } from "./Toast";
import { adminApi } from "./api";

/** Ana admin: şirketi aktif/pasif yapar ve mail uzantısı ekler. */
export function CompanyAdminControls({ companyId, isActive, domains }: { companyId: number; isActive: boolean; domains: string[] }) {
  const router = useRouter();
  const [flash, setFlash] = useFlash();
  const [domain, setDomain] = useState("");

  async function patch(body: { is_active?: boolean; add_domain?: string }, okText: string) {
    const r = await adminApi("PATCH", `/api/admin/companies/${companyId}`, body);
    setFlash({ kind: r.ok ? "ok" : "error", text: r.ok ? okText : r.message });
    if (r.ok) {
      setDomain("");
      router.refresh();
    }
  }

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "end", margin: "0 0 32px", padding: 16, border: "1px solid var(--color-divider)", background: "#fff" }}>
      <Toast flash={flash} onClose={() => setFlash(null)} />
      <div>
        <div className="card-kicker" style={{ marginBottom: 6 }}>Durum</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className={`tag ${isActive ? "tag-accent" : "tag-neutral"}`}>{isActive ? "Aktif" : "Pasif"}</span>
          <button type="button" className="btn btn-secondary" onClick={() => patch({ is_active: !isActive }, isActive ? "Şirket pasifleştirildi." : "Şirket aktifleştirildi.")} style={{ padding: "6px 14px" }}>
            {isActive ? "Pasifleştir" : "Aktifleştir"}
          </button>
        </div>
        {isActive && <div style={{ fontSize: 12, color: "var(--muted-55)", marginTop: 6, maxWidth: 260 }}>Pasif şirkete yeni kayıt/katılım alınmaz; mevcut üyelikler ve atamalar korunur.</div>}
      </div>
      <div>
        <div className="card-kicker" style={{ marginBottom: 6 }}>Mail uzantıları</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {domains.length ? domains.map((d) => <code key={d} className="tag tag-neutral">@{d}</code>) : <span style={{ color: "var(--muted-55)" }}>Tanımlı uzantı yok</span>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (domain.trim()) void patch({ add_domain: domain }, "Uzantı eklendi."); }} style={{ display: "flex", gap: 8 }}>
          <input className="input" aria-label="Yeni mail uzantısı" placeholder="@sirketiniz.com" value={domain} onChange={(e) => setDomain(e.target.value)} style={{ background: "#fff", minHeight: 36 }} />
          <button type="submit" className="btn btn-secondary" disabled={!domain.trim()} style={{ padding: "6px 14px" }}>Ekle</button>
        </form>
      </div>
    </div>
  );
}

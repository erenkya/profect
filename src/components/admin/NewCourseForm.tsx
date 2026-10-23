"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Corners } from "@/components/Corners";
import { Toast, useFlash } from "./Toast";
import { adminApi } from "./api";

export function NewCourseForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", category: "", price: "" });
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    const r = await adminApi("POST", "/api/admin/courses", { title: f.title, description: f.description, category: f.category, price: Number(f.price) || 0 });
    setBusy(false);
    if (r.ok) router.push(`/admin/kurslar/${r.json.courseId}`);
    else setFlash({ kind: "error", text: r.message });
  }

  if (!open) return <button className="btn btn-primary blueprint" onClick={() => setOpen(true)}><Corners />Yeni kurs</button>;
  const input = { background: "#fff", fontSize: 15, minHeight: 40 } as const;
  return (
    <form onSubmit={submit} className="card blueprint" style={{ background: "#fff", padding: 24, gap: 14, maxWidth: 560, marginBottom: 32 }}>
      <Corners />
      <div className="field"><label htmlFor="nc-title">Başlık</label><input id="nc-title" className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={input} /></div>
      <div className="field"><label htmlFor="nc-desc">Açıklama</label><textarea id="nc-desc" className="input" required rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ background: "#fff", fontSize: 15 }} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field"><label htmlFor="nc-cat">Kategori</label><input id="nc-cat" className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={input} /></div>
        <div className="field"><label htmlFor="nc-price">Fiyat (₺)</label><input id="nc-price" className="input" type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} style={input} /></div>
      </div>
      <Toast flash={flash} onClose={() => setFlash(null)} />
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={busy} className="btn btn-primary blueprint"><Corners />{busy ? "Oluşturuluyor…" : "Oluştur ve düzenle"}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Vazgeç</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted-55)", margin: 0 }}>Kurs taslak olarak oluşturulur; içeriği ekledikten sonra yayınlayın.</p>
    </form>
  );
}

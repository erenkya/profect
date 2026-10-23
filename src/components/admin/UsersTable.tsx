"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toast, useFlash } from "./Toast";
import { formatDate } from "@/lib/format";
import { adminApi } from "./api";

export type AdminUser = {
  id: number; full_name: string; email: string; role: "user" | "admin"; is_active: number; email_verified: number;
  plus_until: string | null; last_login_at: string | null; created_at: string; enrollment_count: number;
};

export function UsersTable({ users, currentUserId }: { users: AdminUser[]; currentUserId: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [flash, setFlash] = useFlash();

  async function act(p: ReturnType<typeof adminApi>) {
    const r = await p;
    setFlash({ kind: r.ok ? "ok" : "error", text: r.ok ? "Güncellendi." : r.message });
    if (r.ok) router.refresh();
  }
  const shown = users.filter((u) => (u.full_name + u.email).toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR")));
  const plusActive = (u: AdminUser) => !!u.plus_until && new Date(u.plus_until.replace(" ", "T") + "Z") > new Date();

  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input className="input" placeholder="Ad veya e-posta ara…" value={q} onChange={(e) => setQ(e.target.value)} style={{ background: "#fff", maxWidth: 320 }} aria-label="Kullanıcı ara" />
        <span style={{ fontSize: 13, color: "var(--muted-55)" }}>{shown.length} kullanıcı</span>
      </div>
      <Toast flash={flash} onClose={() => setFlash(null)} />
      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>Kayıt</th><th>Plus</th><th>Son giriş</th><th>İşlemler</th></tr></thead>
          <tbody>
            {shown.map((u) => {
              const self = u.id === currentUserId;
              return (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td>{u.email}{!u.email_verified && <span className="tag tag-neutral" style={{ marginLeft: 8 }}>doğrulanmadı</span>}</td>
                  <td><span className={`tag ${u.role === "admin" ? "tag-accent-2" : "tag-neutral"}`}>{u.role === "admin" ? "Yönetici" : "Kullanıcı"}</span></td>
                  <td>{u.is_active ? "Aktif" : "Pasif"}</td>
                  <td>{u.enrollment_count}</td>
                  <td>{plusActive(u) ? `${formatDate(u.plus_until)}'e kadar` : "—"}</td>
                  <td>{formatDate(u.last_login_at) || "—"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={self} onClick={() => act(adminApi("PATCH", `/api/admin/users/${u.id}`, { is_active: !u.is_active }))}>{u.is_active ? "Pasifleştir" : "Aktifleştir"}</button>
                    <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} disabled={self} onClick={() => act(adminApi("PATCH", `/api/admin/users/${u.id}`, { role: u.role === "admin" ? "user" : "admin" }))}>{u.role === "admin" ? "Yetkiyi al" : "Yönetici yap"}</button>
                    <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => act(adminApi("PATCH", `/api/admin/users/${u.id}`, { plus_until: plusActive(u) ? null : new Date(Date.now() + 30 * 864e5).toISOString() }))}>{plusActive(u) ? "Plus kaldır" : "Plus ver (30 gün)"}</button>
                    {!u.email_verified && <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => act(adminApi("PATCH", `/api/admin/users/${u.id}`, { email_verified: true }))}>E-postayı onayla</button>}
                    <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} disabled={self} onClick={() => confirm(`${u.full_name} kalıcı olarak silinsin mi? Kayıtları, ilerlemesi ve sertifikaları da silinir.`) && act(adminApi("DELETE", `/api/admin/users/${u.id}`))}>Sil</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

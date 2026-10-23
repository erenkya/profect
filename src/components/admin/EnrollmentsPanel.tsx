"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Corners } from "@/components/Corners";
import { Toast, useFlash } from "./Toast";
import { formatDate } from "@/lib/format";
import { adminApi } from "./api";

export type EnrollmentRow = { id: number; user_id: number; course_id: number; user_name: string; user_email: string; course_title: string; status: string; source: string; enrolled_at: string; completed_lessons: number; total_lessons: number; certificate_code: string | null };
type Opt = { id: number; label: string };

const SOURCE: Record<string, string> = { admin: "Yönetici", purchase: "Satın alma", plus: "Plus" };

export function EnrollmentsPanel({ rows, users, courses }: { rows: EnrollmentRow[]; users: Opt[]; courses: Opt[] }) {
  const router = useRouter();
  const [userIds, setUserIds] = useState<number[]>([]);
  const [courseIds, setCourseIds] = useState<number[]>([]);
  const [flash, setFlash] = useFlash();
  const [filter, setFilter] = useState("");

  const toggle = (arr: number[], set: (v: number[]) => void, id: number) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  async function assign() {
    const r = await adminApi("POST", "/api/admin/enrollments", { user_ids: userIds, course_ids: courseIds });
    setFlash({ kind: r.ok ? "ok" : "error", text: r.message });
    if (r.ok) {
      setUserIds([]);
      setCourseIds([]);
      router.refresh();
    }
  }
  async function remove(id: number) {
    if (!confirm("Bu kayıt silinsin mi? Kullanıcı kursa erişimini kaybeder.")) return;
    const r = await adminApi("DELETE", `/api/admin/enrollments?id=${id}`);
    setFlash({ kind: r.ok ? "ok" : "error", text: r.message });
    if (r.ok) router.refresh();
  }

  // Zaten atanmış çiftler listeden düşsün: tüm kurslara atanmış kullanıcı ve tüm kullanıcılara atanmış kurs gösterilmez.
  const enrolled = new Set(rows.map((r) => `${r.user_id}:${r.course_id}`));
  const availableUsers = users.filter((u) => courses.some((c) => !enrolled.has(`${u.id}:${c.id}`)));
  const availableCourses = courses.filter((c) => users.some((u) => !enrolled.has(`${u.id}:${c.id}`)));

  const box = { border: "1px solid var(--color-divider)", background: "#fff", maxHeight: 220, overflowY: "auto", padding: 8 } as const;
  const shown = rows.filter((r) => (r.user_name + r.user_email + r.course_title).toLocaleLowerCase("tr-TR").includes(filter.toLocaleLowerCase("tr-TR")));

  return (
    <>
      <div className="card blueprint" style={{ background: "#fff", padding: 24, gap: 16, marginBottom: 32 }}>
        <Corners />
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 600 }}>Toplu atama</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
          <div>
            <div className="card-kicker" style={{ marginBottom: 6 }}>Kullanıcılar ({userIds.length})</div>
            <div style={box} role="group" aria-label="Kullanıcılar">
              {availableUsers.map((u) => (
                <label key={u.id} style={{ display: "flex", gap: 8, fontSize: 14, padding: "3px 0", cursor: "pointer" }}>
                  <input type="checkbox" checked={userIds.includes(u.id)} onChange={() => toggle(userIds, setUserIds, u.id)} />{u.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="card-kicker" style={{ marginBottom: 6 }}>Kurslar ({courseIds.length})</div>
            <div style={box} role="group" aria-label="Kurslar">
              {availableCourses.map((c) => (
                <label key={c.id} style={{ display: "flex", gap: 8, fontSize: 14, padding: "3px 0", cursor: "pointer" }}>
                  <input type="checkbox" checked={courseIds.includes(c.id)} onChange={() => toggle(courseIds, setCourseIds, c.id)} />{c.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div><button className="btn btn-primary blueprint" disabled={!userIds.length || !courseIds.length} onClick={assign}><Corners />Ata</button></div>
      </div>

      <Toast flash={flash} onClose={() => setFlash(null)} />
      <input className="input" placeholder="Kullanıcı veya kurs ara…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ background: "#fff", maxWidth: 320, marginBottom: 16 }} aria-label="Kayıt ara" />
      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>Kullanıcı</th><th>Kurs</th><th>Kaynak</th><th>İlerleme</th><th>Durum</th><th>Tarih</th><th /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.user_name}<div style={{ fontSize: 12, color: "var(--muted-55)" }}>{r.user_email}</div></td>
                <td>{r.course_title}</td>
                <td>{SOURCE[r.source] ?? r.source}</td>
                <td>{r.completed_lessons} / {r.total_lessons}</td>
                <td>{r.status === "completed" ? "Tamamladı" : "Devam ediyor"}{r.certificate_code && <div style={{ fontSize: 12 }}>{r.certificate_code}</div>}</td>
                <td>{formatDate(r.enrolled_at)}</td>
                <td><button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => remove(r.id)}>Kaldır</button></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted-55)" }}>Kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

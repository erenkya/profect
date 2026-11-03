"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Toast, useFlash } from "@/components/admin/Toast";
import { adminApi } from "@/components/admin/api";
import { ReclaimDialog } from "@/components/company/ReclaimDialog";
import type { CompanyPanelData } from "@/lib/company-panel";

const STATUS = { not_started: ["Başlamadı", "tag-neutral"], in_progress: ["Devam ediyor", "tag-accent-2"], completed: ["Tamamlandı", "tag-accent"] } as const;
const h2 = { fontSize: 28, textTransform: "uppercase", margin: "0 0 12px" } as const;
const select = { background: "#fff", minHeight: 36, maxWidth: 220 } as const;

type Pending = { message: React.ReactNode; confirmLabel?: string; run: () => Promise<void> };

/** Şirket paneli. `platform` ana adminin görünümüdür: ek olarak kontenjan tanımlama kutusu açılır. */
export function CompanyPanel({ data, platform = false }: { data: CompanyPanelData; platform?: boolean }) {
  const router = useRouter();
  const [flash, setFlash] = useFlash();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignee, setAssignee] = useState<Record<number, string>>({});
  const [grant, setGrant] = useState({ courseId: "", delta: "" });
  const base = `/api/company/${data.company.id}`;
  const slugOf = (courseId: number) => data.courses.find((c) => c.id === courseId)?.slug;
  const buyHref = (courseId: number) => { const s = slugOf(courseId); return s ? `/sirket/kontenjan-al/${s}` : null; };

  type Res = Awaited<ReturnType<typeof adminApi>>;
  /** Başarıda bildirir ve sayfayı yeniler; sonucu çağırana verir (needs_confirm gibi durumlar için). */
  async function run(p: Promise<Res>, okText: string): Promise<Res> {
    const r = await p;
    if (r.ok) {
      setFlash({ kind: "ok", text: okText });
      router.refresh();
    } else if (r.json.reason !== "needs_confirm") {
      setFlash({ kind: "error", text: r.message });
    }
    return r;
  }
  async function confirmed() {
    if (!pending) return;
    setBusy(true);
    try { await pending.run(); } finally { setBusy(false); setPending(null); }
  }

  const assign = (courseId: number) => {
    const userId = Number(assignee[courseId]);
    if (!userId) return setFlash({ kind: "error", text: "Önce bir çalışan seçin." });
    void run(adminApi("POST", `${base}/assignments`, { user_id: userId, course_id: courseId }), "Eğitim atandı.");
  };

  async function reclaim(row: CompanyPanelData["progress"][number]) {
    const r = await run(adminApi("POST", `${base}/assignments/${row.assignmentId}/reclaim`, {}), "Kontenjan geri alındı.");
    if (r.json.reason !== "needs_confirm") return;
    setPending({
      message: <><strong>{row.userName}</strong> bu eğitimde en az bir video izlemiş: <strong>{row.courseTitle}</strong>. Bu eğitimin hakkı yeni bir kişiye <strong>verilemez</strong>. Devam ederseniz erişimi kapanır ve kontenjan yanmış sayılır.</>,
      run: async () => { await run(adminApi("POST", `${base}/assignments/${row.assignmentId}/reclaim`, { confirm_burn: true }), "Kontenjan geri alındı; hak yanmış sayıldı."); },
    });
  }

  const member = (id: number, action: "approve" | "reject" | "promote" | "demote", okText: string) => void run(adminApi("PATCH", `${base}/members/${id}`, { action }), okText);

  async function removeMember(m: CompanyPanelData["activeMembers"][number]) {
    const r = await run(adminApi("PATCH", `${base}/members/${m.id}`, { action: "remove" }), "Üye şirketten çıkarıldı.");
    if (r.json.reason !== "needs_confirm") return;
    const titles = (r.json.courseTitles as string[] | undefined) ?? [];
    setPending({
      confirmLabel: "Yine de çıkar",
      message: <><strong>{m.name}</strong> şu eğitimlerde en az bir video izlemiş: <strong>{titles.join(", ")}</strong>. Bu eğitimlerin hakkı yeni bir kişiye <strong>verilemez</strong>. Devam ederseniz erişimleri kapanır ve kontenjanlar yanmış sayılır.</>,
      run: async () => { await run(adminApi("PATCH", `${base}/members/${m.id}`, { action: "remove", confirm_burn: true }), "Üye çıkarıldı; haklar yanmış sayıldı."); },
    });
  }

  const resolveRequest = (id: number, action: "assign" | "reject") =>
    void run(adminApi("POST", `${base}/requests/${id}`, { action }), action === "assign" ? "Eğitim atandı." : "Talep reddedildi.");

  function submitGrant(e: React.FormEvent) {
    e.preventDefault();
    const delta = Number(grant.delta);
    if (!grant.courseId || !Number.isInteger(delta) || delta === 0) return setFlash({ kind: "error", text: "Eğitim seçin ve 0'dan farklı bir tam sayı girin." });
    void run(adminApi("POST", `${base}/allocations`, { course_id: Number(grant.courseId), delta }), "Kontenjan güncellendi.").then((r) => { if (r.ok) setGrant({ courseId: "", delta: "" }); });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data.company.code);
      setFlash({ kind: "ok", text: "Şirket kodu kopyalandı." });
    } catch {
      setFlash({ kind: "error", text: "Kopyalanamadı; kodu elle seçip kopyalayın." });
    }
  }

  const waiting = data.pendingMembers.length + data.openRequests.length;

  return (
    <div style={{ display: "grid", gap: 40 }}>
      <Toast flash={flash} onClose={() => setFlash(null)} />
      <ReclaimDialog message={pending?.message ?? null} confirmLabel={pending?.confirmLabel} busy={busy} onCancel={() => setPending(null)} onConfirm={confirmed} />

      <header>
        <h1 style={{ fontSize: "clamp(36px,5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 10px" }}>{data.company.name}</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--muted-72)" }}>Şirket kodu</span>
          <code style={{ fontSize: 18, padding: "4px 10px", border: "1px solid var(--color-divider)", background: "#fff" }}>{data.company.code}</code>
          <button type="button" className="btn btn-secondary" onClick={copyCode} style={{ padding: "6px 12px" }}><Copy size={14} aria-hidden /> Kopyala</button>
        </div>
        <p style={{ color: "var(--muted-72)", margin: "8px 0 0", maxWidth: 640 }}>Çalışanlarınız kayıt olurken bu kodu girer; katılım isteklerini aşağıda onaylarsınız.</p>
      </header>

      <section aria-labelledby="sec-seats">
        <h2 id="sec-seats" style={h2}>Kontenjanlar</h2>
        {data.seats.length === 0 ? (
          <p style={{ color: "var(--muted-72)" }}>Henüz kontenjanınız yok. Aşağıdan bir eğitim için kontenjan satın alın.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="table">
              <thead><tr><th>Eğitim</th><th>Toplam</th><th>Atanan</th><th>Boş</th><th>Yanan</th><th>İşlemler</th></tr></thead>
              <tbody>
                {data.seats.map((s) => (
                  <tr key={s.courseId}>
                    <td>{s.courseTitle}</td><td>{s.total}</td><td>{s.assigned}</td><td><strong>{s.free}</strong></td><td>{s.burned}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {s.free > 0 && (
                          <>
                            <select className="input" aria-label={`${s.courseTitle} için çalışan seç`} value={assignee[s.courseId] ?? ""} onChange={(e) => setAssignee((a) => ({ ...a, [s.courseId]: e.target.value }))} style={select}>
                              <option value="">Çalışan seç…</option>
                              {data.activeMembers.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                            </select>
                            <button type="button" className="btn btn-primary" onClick={() => assign(s.courseId)} style={{ padding: "6px 14px" }}>Ata</button>
                          </>
                        )}
                        {buyHref(s.courseId) && <Link href={buyHref(s.courseId)!} style={{ fontSize: 14 }}>Daha fazla al</Link>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="buy-course" style={{ fontSize: 14 }}>Yeni kontenjan al:</label>
          <select id="buy-course" className="input" defaultValue="" onChange={(e) => { if (e.target.value) router.push(`/sirket/kontenjan-al/${e.target.value}`); }} style={select}>
            <option value="">Eğitim seç…</option>
            {data.courses.map((c) => <option key={c.id} value={c.slug}>{c.title}</option>)}
          </select>
        </div>
        {platform && (
          <form onSubmit={submitGrant} style={{ marginTop: 20, padding: 14, border: "1px dashed var(--color-divider)", display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <div className="field"><label htmlFor="grant-course">Kontenjan tanımla (özel anlaşma)</label>
              <select id="grant-course" className="input" value={grant.courseId} onChange={(e) => setGrant((g) => ({ ...g, courseId: e.target.value }))} style={select}>
                <option value="">Eğitim seç…</option>
                {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="grant-delta">Adet (azaltmak için −)</label>
              <input id="grant-delta" className="input" type="number" step={1} value={grant.delta} onChange={(e) => setGrant((g) => ({ ...g, delta: e.target.value }))} style={{ background: "#fff", width: 120 }} />
            </div>
            <button type="submit" className="btn btn-secondary">Uygula</button>
          </form>
        )}
      </section>

      <section aria-labelledby="sec-progress">
        <h2 id="sec-progress" style={h2}>Çalışanlar ve ilerleme</h2>
        {data.progress.length === 0 ? (
          <p style={{ color: "var(--muted-72)" }}>Henüz atanmış eğitim yok.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="table">
              <thead><tr><th>Çalışan</th><th>Eğitim</th><th>İlerleme</th><th>Durum</th><th>Sertifika</th><th /></tr></thead>
              <tbody>
                {data.progress.map((p) => {
                  const pct = p.totalLessons > 0 ? Math.round((p.completedLessons / p.totalLessons) * 100) : 0;
                  const [label, cls] = STATUS[p.status];
                  return (
                    <tr key={p.assignmentId}>
                      <td>{p.userName}<div style={{ fontSize: 12, color: "var(--muted-55)" }}>{p.userEmail}</div></td>
                      <td>{p.courseTitle}</td>
                      <td>{p.completedLessons}/{p.totalLessons} ders (%{pct})</td>
                      <td><span className={`tag ${cls}`}>{label}</span></td>
                      <td>{p.certificateCode ?? "—"}</td>
                      <td><button type="button" className="btn btn-secondary" onClick={() => reclaim(p)} style={{ padding: "6px 12px" }}>Kontenjanı geri al</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="sec-waiting">
        <h2 id="sec-waiting" style={h2}>Bekleyenler{waiting > 0 && <span className="tag tag-accent-2" style={{ marginLeft: 10, verticalAlign: "middle" }}>{waiting}</span>}</h2>
        {waiting === 0 && <p style={{ color: "var(--muted-72)" }}>Bekleyen katılım isteği ya da eğitim talebi yok.</p>}
        {data.pendingMembers.length > 0 && (
          <div className="admin-table-wrap" style={{ marginBottom: 16 }}>
            <table className="table">
              <thead><tr><th>Katılım isteği</th><th>E-posta</th><th /></tr></thead>
              <tbody>
                {data.pendingMembers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td><td>{m.email}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn btn-primary" onClick={() => member(m.id, "approve", "Katılım onaylandı.")} style={{ padding: "6px 14px" }}>Onayla</button>
                      <button type="button" className="btn btn-secondary" onClick={() => member(m.id, "reject", "Katılım reddedildi.")} style={{ padding: "6px 14px" }}>Reddet</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.openRequests.length > 0 && (
          <div className="admin-table-wrap">
            <table className="table">
              <thead><tr><th>Eğitim talebi</th><th>Eğitim</th><th /></tr></thead>
              <tbody>
                {data.openRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.userName}</td><td>{r.courseTitle}</td>
                    <td style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {r.freeSeats > 0
                        ? <button type="button" className="btn btn-primary" onClick={() => resolveRequest(r.id, "assign")} style={{ padding: "6px 14px" }}>Kontenjan ata ({r.freeSeats} boş)</button>
                        : buyHref(r.courseId) ? <Link href={buyHref(r.courseId)!} className="btn btn-secondary" style={{ padding: "6px 14px" }}>Satın al</Link> : <span style={{ fontSize: 13, color: "var(--muted-55)" }}>Boş kontenjan yok</span>}
                      <button type="button" className="btn btn-secondary" onClick={() => resolveRequest(r.id, "reject")} style={{ padding: "6px 14px" }}>Reddet</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="sec-members">
        <h2 id="sec-members" style={h2}>Üyeler</h2>
        <div className="admin-table-wrap">
          <table className="table">
            <thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th /></tr></thead>
            <tbody>
              {data.activeMembers.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td><td>{m.email}</td>
                  <td><span className={`tag ${m.role === "admin" ? "tag-accent-2" : "tag-neutral"}`}>{m.role === "admin" ? "Şirket yöneticisi" : "Üye"}</span></td>
                  <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {m.role === "member"
                      ? <button type="button" className="btn btn-secondary" onClick={() => member(m.id, "promote", "Yönetici yapıldı.")} style={{ padding: "6px 12px" }}>Yönetici yap</button>
                      : <button type="button" className="btn btn-secondary" onClick={() => member(m.id, "demote", "Yöneticilik kaldırıldı.")} style={{ padding: "6px 12px" }}>Yöneticiliği kaldır</button>}
                    <button type="button" className="btn btn-secondary" onClick={() => removeMember(m)} style={{ padding: "6px 12px" }}>Çıkar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

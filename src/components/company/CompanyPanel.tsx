"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Download } from "lucide-react";
import { Toast, useFlash } from "@/components/admin/Toast";
import { adminApi } from "@/components/admin/api";
import { AssignMatrix } from "@/components/company/AssignMatrix";
import { DueEditor } from "@/components/company/DueEditor";
import { ReclaimDialog } from "@/components/company/ReclaimDialog";
import { startedReclaimText } from "@/lib/company-copy";
import type { CompanyPanelData } from "@/lib/company-panel";
import { dueState, formatIstanbul, remainingLabel, type DueState } from "@/lib/due-rules";
import { quizOutcome, quizzesPassed } from "@/lib/progress-report";

const STATUS = { not_started: ["Başlamadı", "tag-neutral"], in_progress: ["Devam ediyor", "tag-accent-2"], completed: ["Tamamlandı", "tag-accent"] } as const;
const h2 = { fontSize: 28, textTransform: "uppercase", margin: "0 0 12px" } as const;
const select = { background: "#fff", minHeight: 36, maxWidth: 220 } as const;
const DUE_TAG: Record<Exclude<DueState, "none">, string> = { ok: "tag-neutral", soon: "tag-accent-2", overdue: "tag-accent-2" };

/** Süre durumu etiketi: "3 gün kaldı" / "Süresi doldu". Saat her render'da okunur; sunucu-istemci arasında dakika kayabilir. */
function DueTag({ due }: { due: string }) {
  const now = Date.now();
  return <span className={`tag ${DUE_TAG[dueState(due, now) as Exclude<DueState, "none">]}`} suppressHydrationWarning>{remainingLabel(due, now)}</span>;
}

const OUTCOME_TAG = { "Geçti": "tag-accent", "Kaldı": "tag-accent-2", "Girmedi": "tag-neutral" } as const;

/** Çalışanın sınav özeti ("1/2 geçti"); açılınca her sınavın en yüksek puanı ve deneme sayısı. */
function QuizCell({ quizzes }: { quizzes: CompanyPanelData["progress"][number]["quizzes"] }) {
  if (quizzes.length === 0) return <>—</>;
  return (
    <details>
      <summary style={{ cursor: "pointer" }}>{quizzesPassed(quizzes)}/{quizzes.length} geçti</summary>
      <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6, fontSize: 13 }}>
        {quizzes.map((q) => {
          const outcome = quizOutcome(q);
          return (
            <li key={q.quizId}>
              <span className={`tag ${OUTCOME_TAG[outcome]}`}>{outcome}</span>{" "}
              {q.moduleTitle ? `${q.moduleTitle} sınavı` : "Final sınavı"}
              <div style={{ color: "var(--muted-55)" }}>
                {q.attempts === 0 ? `Geçme notu %${q.passingScore}` : `En yüksek %${q.bestScore} · ${q.attempts} deneme · geçme notu %${q.passingScore}`}
                {q.lastAttemptAt && <> · {formatIstanbul(q.lastAttemptAt)}</>}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

type Pending = { message: React.ReactNode; confirmLabel?: string; run: () => Promise<void> };

/** Şirket paneli. `platform` ana adminin görünümüdür: ek olarak kontenjan tanımlama kutusu açılır. */
export function CompanyPanel({ data, platform = false }: { data: CompanyPanelData; platform?: boolean }) {
  const router = useRouter();
  const [flash, setFlash] = useFlash();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkFailed, setBulkFailed] = useState<{ userName: string; title: string; message: string }[]>([]);
  const [grant, setGrant] = useState({ target: "", delta: "" });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const base = `/api/company/${data.company.id}`;
  const slugOf = (courseId: number) => data.courses.find((c) => c.id === courseId)?.slug;
  const buyHref = (courseId: number) => { const s = slugOf(courseId); return s ? `/sirket/kontenjan-al/${s}` : null; };
  const programBuyHref = (programId: number) => { const s = data.programs.find((p) => p.id === programId)?.slug; return s ? `/sirket/kontenjan-al/program/${s}` : null; };

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

  /** Toplu atama sonucu: toast + başarısız kutucuk listesi; sayfa yenilenir (hücreler "atandı" olur). */
  function bulkDone(r: { assigned: number; failed: { userName: string; title: string; message: string }[] }) {
    setBulkFailed(r.failed);
    if (r.assigned > 0) setFlash({ kind: "ok", text: r.failed.length ? `${r.assigned} atama yapıldı, ${r.failed.length} atama yapılamadı.` : `${r.assigned} atama yapıldı.` });
    else setFlash({ kind: "error", text: r.failed[0]?.userName === "" ? r.failed[0].message : "Hiçbir atama yapılamadı." });
    router.refresh();
  }

  /** Eğitimin tüm çalışanlar için geçerli son tarihi (Türkiye saati); null kaldırır. */
  const saveCourseDeadline = async (courseId: number, local: string | null) => {
    await run(adminApi("PUT", `${base}/deadlines`, { course_id: courseId, due_at: local }), local ? "Eğitim son tarihi kaydedildi." : "Eğitim son tarihi kaldırıldı.");
  };

  /** Çalışana özel son tarih (Türkiye saati); null kaldırır. Süresi dolmuş çalışana ileri bir tarih vermek erişimi yeniden açar. */
  const saveAssignmentDue = async (assignmentId: number, local: string | null) => {
    await run(adminApi("PATCH", `${base}/assignments/${assignmentId}`, { due_at: local }), local ? "Son tarih kaydedildi." : "Son tarih kaldırıldı.");
  };

  async function reclaim(row: CompanyPanelData["progress"][number]) {
    const r = await run(adminApi("POST", `${base}/assignments/${row.assignmentId}/reclaim`, {}), "Kontenjan geri alındı.");
    if (r.json.reason !== "needs_confirm") return;
    setPending({
      message: startedReclaimText({ name: row.userName, titles: [row.courseTitle] }),
      run: async () => { await run(adminApi("POST", `${base}/assignments/${row.assignmentId}/reclaim`, { confirm_burn: true }), "Kontenjan geri alındı; hak yanmış sayıldı."); },
    });
  }

  async function reclaimProgram(row: CompanyPanelData["programProgress"][number]) {
    const r = await run(adminApi("POST", `${base}/program-assignments/${row.assignmentId}/reclaim`, {}), "Kontenjan geri alındı.");
    if (r.json.reason !== "needs_confirm") return;
    setPending({
      message: startedReclaimText({ name: row.userName, titles: [row.programTitle] }),
      run: async () => { await run(adminApi("POST", `${base}/program-assignments/${row.assignmentId}/reclaim`, { confirm_burn: true }), "Kontenjan geri alındı; hak yanmış sayıldı."); },
    });
  }

  const member = (id: number, action: "approve" | "reject" | "promote" | "demote", okText: string) => void run(adminApi("PATCH", `${base}/members/${id}`, { action }), okText);

  async function removeMember(m: CompanyPanelData["activeMembers"][number]) {
    const r = await run(adminApi("PATCH", `${base}/members/${m.id}`, { action: "remove" }), "Üye şirketten çıkarıldı.");
    if (r.json.reason !== "needs_confirm") return;
    const titles = (r.json.courseTitles as string[] | undefined) ?? [];
    setPending({
      message: startedReclaimText({ name: m.name, titles }),
      run: async () => { await run(adminApi("PATCH", `${base}/members/${m.id}`, { action: "remove", confirm_burn: true }), "Üye çıkarıldı; haklar yanmış sayıldı."); },
    });
  }

  const resolveRequest = (id: number, action: "assign" | "reject") =>
    void run(adminApi("POST", `${base}/requests/${id}`, { action }), action === "assign" ? "Eğitim atandı." : "Talep reddedildi.");

  function submitGrant(e: React.FormEvent) {
    e.preventDefault();
    const delta = Number(grant.delta);
    if (!grant.target || !Number.isInteger(delta) || delta === 0) return setFlash({ kind: "error", text: "Eğitim ya da program seçin ve 0'dan farklı bir tam sayı girin." });
    const [kind, id] = grant.target.split(":");
    void run(adminApi("POST", `${base}/allocations`, { ...(kind === "p" ? { program_id: Number(id) } : { course_id: Number(id) }), delta }), "Kontenjan güncellendi.").then((r) => { if (r.ok) setGrant({ target: "", delta: "" }); });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data.company.code);
      setFlash({ kind: "ok", text: "Şirket kodu kopyalandı." });
    } catch {
      setFlash({ kind: "error", text: "Kopyalanamadı; kodu elle seçip kopyalayın." });
    }
  }

  const progressUserIds = [...new Set(data.progress.map((p) => p.userId))];
  const allSelected = progressUserIds.length > 0 && progressUserIds.every((id) => selected.has(id));
  const toggleUser = (userId: number) => setSelected((s) => { const n = new Set(s); if (!n.delete(userId)) n.add(userId); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(progressUserIds));
  const reportHref = `${base}/report`;
  const selectedReportHref = `${reportHref}?users=${progressUserIds.filter((id) => selected.has(id)).join(",")}`;

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
        {data.seats.length === 0 && data.programSeats.length === 0 ? (
          <p style={{ color: "var(--muted-72)" }}>Henüz kontenjanınız yok. Aşağıdan bir eğitim ya da program için kontenjan satın alın.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="table">
              <thead><tr><th>Eğitim</th><th>Toplam</th><th>Atanan</th><th>Boş</th><th>Yanan</th><th>Eğitim son tarihi</th><th>İşlemler</th></tr></thead>
              <tbody>
                {data.seats.map((s) => (
                  <tr key={`c${s.courseId}`}>
                    <td>{s.courseTitle}</td><td>{s.total}</td><td>{s.assigned}</td><td><strong>{s.free}</strong></td><td>{s.burned}</td>
                    <td>
                      <DueEditor key={s.deadline ?? "none"} value={s.deadline} label={`${s.courseTitle} son tarihi`} onSave={(local) => saveCourseDeadline(s.courseId, local)} />
                      {s.deadline && <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted-55)", display: "flex", gap: 6, alignItems: "center" }}>{formatIstanbul(s.deadline)} <DueTag due={s.deadline} /></div>}
                    </td>
                    <td>{buyHref(s.courseId) && <Link href={buyHref(s.courseId)!} style={{ fontSize: 14 }}>Daha fazla al</Link>}</td>
                  </tr>
                ))}
                {data.programSeats.length > 0 && (
                  <tr><th colSpan={7} scope="colgroup" style={{ textAlign: "left", background: "var(--color-bg-alt, #f6f6f6)" }}>Programlar</th></tr>
                )}
                {data.programSeats.map((s) => (
                  <tr key={`p${s.programId}`}>
                    <td>{s.programTitle} <span className="tag tag-neutral">Program</span></td><td>{s.total}</td><td>{s.assigned}</td><td><strong>{s.free}</strong></td><td>{s.burned}</td>
                    <td>—</td>
                    <td>{programBuyHref(s.programId) && <Link href={programBuyHref(s.programId)!} style={{ fontSize: 14 }}>Daha fazla al</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="buy-course" style={{ fontSize: 14 }}>Yeni kontenjan al:</label>
          <select id="buy-course" className="input" defaultValue="" onChange={(e) => { if (e.target.value) router.push(`/sirket/kontenjan-al/${e.target.value}`); }} style={select}>
            <option value="">Eğitim ya da program seç…</option>
            <optgroup label="Eğitimler">
              {data.courses.map((c) => <option key={c.id} value={c.slug}>{c.title}</option>)}
            </optgroup>
            {data.programs.length > 0 && (
              <optgroup label="Programlar">
                {data.programs.map((p) => <option key={p.id} value={`program/${p.slug}`}>{p.title}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        {platform && (
          <form onSubmit={submitGrant} style={{ marginTop: 20, padding: 14, border: "1px dashed var(--color-divider)", display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <div className="field"><label htmlFor="grant-course">Kontenjan tanımla (özel anlaşma)</label>
              <select id="grant-course" className="input" value={grant.target} onChange={(e) => setGrant((g) => ({ ...g, target: e.target.value }))} style={select}>
                <option value="">Eğitim ya da program seç…</option>
                <optgroup label="Eğitimler">
                  {data.courses.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.title}</option>)}
                </optgroup>
                {data.programs.length > 0 && (
                  <optgroup label="Programlar">
                    {data.programs.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.title}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="field"><label htmlFor="grant-delta">Adet (azaltmak için −)</label>
              <input id="grant-delta" className="input" type="number" step={1} value={grant.delta} onChange={(e) => setGrant((g) => ({ ...g, delta: e.target.value }))} style={{ background: "#fff", width: 120 }} />
            </div>
            <button type="submit" className="btn btn-secondary">Uygula</button>
          </form>
        )}
      </section>

      <section aria-labelledby="sec-assign">
        <h2 id="sec-assign" style={h2}>Eğitim ve program ata</h2>
        <p style={{ color: "var(--muted-72)", margin: "0 0 12px", maxWidth: 640 }}>Çalışanları ve eğitimleri işaretleyin, tek seferde atayın. Aşağıdaki &ldquo;Kalan&rdquo; satırı seçiminize göre güncellenir.</p>
        <AssignMatrix
          base={base}
          members={data.activeMembers.map((m) => ({ userId: m.userId, name: m.name }))}
          matrix={data.matrix}
          buyHref={(c) => (c.kind === "course" ? buyHref(c.id) : programBuyHref(c.id))}
          onDone={bulkDone}
        />
        {bulkFailed.length > 0 && (
          <div role="alert" style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--color-accent-2-300)", background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)", fontSize: 14 }}>
            <strong>Yapılamayan atamalar</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {bulkFailed.map((f, i) => <li key={i}>{f.userName ? `${f.userName} · ${f.title}: ` : ""}{f.message}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="sec-progress">
        <h2 id="sec-progress" style={h2}>Çalışanlar ve ilerleme</h2>
        {data.progress.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <a href={reportHref} className="btn btn-secondary" style={{ padding: "6px 14px" }}><Download size={14} aria-hidden /> Tümünü Excel indir</a>
            {selected.size > 0
              ? <a href={selectedReportHref} className="btn btn-primary" style={{ padding: "6px 14px" }}><Download size={14} aria-hidden /> Seçilenleri Excel indir ({selected.size} kişi)</a>
              : <span style={{ fontSize: 13, color: "var(--muted-55)" }}>Belirli kişilerin raporu için aşağıdan çalışanları seçin.</span>}
          </div>
        )}
        {data.progress.length === 0 && data.programProgress.length === 0 ? (
          <p style={{ color: "var(--muted-72)" }}>Henüz atanmış eğitim yok.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="table">
              <thead><tr><th><input type="checkbox" aria-label="Tüm çalışanları seç" checked={allSelected} onChange={toggleAll} /></th><th>Çalışan</th><th>Eğitim</th><th>İlerleme</th><th>Sınavlar</th><th>Durum</th><th>Son tarih</th><th>Sertifika</th><th /></tr></thead>
              <tbody>
                {data.progress.map((p) => {
                  const [label, cls] = STATUS[p.status];
                  return (
                    <tr key={p.assignmentId}>
                      <td><input type="checkbox" aria-label={`${p.userName} raporda olsun`} checked={selected.has(p.userId)} onChange={() => toggleUser(p.userId)} /></td>
                      <td>{p.userName}<div style={{ fontSize: 12, color: "var(--muted-55)" }}>{p.userEmail}</div></td>
                      <td>{p.courseTitle}</td>
                      <td>{p.completedLessons}/{p.totalLessons} ders · %{p.percentage}</td>
                      <td><QuizCell quizzes={p.quizzes} /></td>
                      <td><span className={`tag ${cls}`}>{label}</span></td>
                      <td>
                        <DueEditor key={p.dueAt ?? "none"} value={p.dueAt} label={`${p.userName} için son tarih`} onSave={(local) => saveAssignmentDue(p.assignmentId, local)} />
                        {p.effectiveDueAt && (
                          <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted-55)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            Geçerli: {formatIstanbul(p.effectiveDueAt)}{p.effectiveDueAt !== p.dueAt && " (eğitim süresi)"}
                            {p.status !== "completed" && <DueTag due={p.effectiveDueAt} />}
                          </div>
                        )}
                      </td>
                      <td>{p.certificateCode ?? "—"}</td>
                      <td><button type="button" className="btn btn-secondary" onClick={() => reclaim(p)} style={{ padding: "6px 12px" }}>Kontenjanı geri al</button></td>
                    </tr>
                  );
                })}
                {data.programProgress.map((p) => {
                  const [label, cls] = STATUS[p.status];
                  return (
                    <tr key={`prog${p.assignmentId}`}>
                      <td />
                      <td>{p.userName}<div style={{ fontSize: 12, color: "var(--muted-55)" }}>{p.userEmail}</div></td>
                      <td>{p.programTitle} <span className="tag tag-neutral">Program</span></td>
                      <td>{p.completedCourses}/{p.totalCourses} kurs</td>
                      <td>—</td>
                      <td><span className={`tag ${cls}`}>{label}</span></td>
                      <td>—</td>
                      <td>{p.certificateCode ?? "—"}</td>
                      <td><button type="button" className="btn btn-secondary" onClick={() => reclaimProgram(p)} style={{ padding: "6px 12px" }}>Kontenjanı geri al</button></td>
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

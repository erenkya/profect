"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EXPERTS, EXPERT_IDS, type ExpertId } from "@/data/experts";
import { ruleCoversDay, type Rule } from "@/lib/meeting-slots";
import { adminApi } from "./api";

type RuleRow = Rule & { id: number; expert: ExpertId; note: string | null };
type Mini = { id: number; expert: ExpertId; startsAt: string; endsAt: string; status: string; fullName: string };

const WEEK = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTH = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const REC: Record<Rule["recurrence"], string> = { once: "Tek seferlik", daily: "Her gün", weekly: "Her hafta", monthly: "Her ay" };
const pad = (n: number) => String(n).padStart(2, "0");
const todayIst = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

function ruleText(r: Rule) {
  const days = r.recurrence === "weekly" ? ` (${WEEK.filter((_, i) => r.weekdays & (1 << i)).join(", ")})` : "";
  const when = r.recurrence === "once" ? r.date : `${r.startsOn}${r.until ? ` → ${r.until}` : " →"}`;
  return `${r.kind === "available" ? "Müsait" : "Müsait değil"} · ${REC[r.recurrence]}${days} · ${when} · ${r.startTime}–${r.endTime}`;
}

export function AvailabilityCalendar({ rules, meetings }: { rules: RuleRow[]; meetings: Mini[] }) {
  const router = useRouter();
  const [expert, setExpert] = useState<ExpertId>("kaan");
  const today = todayIst();
  const [ym, setYm] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
  const [sel, setSel] = useState(today);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ kind: "available" as Rule["kind"], recurrence: "weekly" as Rule["recurrence"], date: today, startsOn: today, until: "", weekdays: 0b0011111, startTime: "10:00", endTime: "17:00", note: "" });

  const mine = rules.filter((r) => r.expert === expert);
  const myMeetings = meetings.filter((m) => m.expert === expert);
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(ym.y, ym.m, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
    return Array.from({ length: Math.ceil((lead + count) / 7) * 7 }, (_, i) => (i < lead || i >= lead + count ? null : `${ym.y}-${pad(ym.m + 1)}-${pad(i - lead + 1)}`));
  }, [ym]);
  const info = (d: string) => ({
    avail: mine.some((r) => r.kind === "available" && ruleCoversDay(r, d)),
    block: mine.some((r) => r.kind === "blocked" && ruleCoversDay(r, d)),
    meets: myMeetings.filter((m) => m.startsAt.startsWith(d)),
  });
  const step = (n: number) => setYm(({ y, m }) => { const t = new Date(Date.UTC(y, m + n, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() }; });

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    const r = await adminApi("POST", "/api/admin/meeting-rules", {
      expert, kind: f.kind, recurrence: f.recurrence, date: f.recurrence === "once" ? f.date : null, startsOn: f.recurrence === "once" ? undefined : f.startsOn,
      until: f.recurrence === "once" || !f.until ? null : f.until, weekdays: f.recurrence === "weekly" ? f.weekdays : 0, startTime: f.startTime, endTime: f.endTime, note: f.note || null,
    });
    setMsg(r.ok ? "Kural eklendi." : r.message);
    if (r.ok) router.refresh();
  }
  async function del(id: number) {
    if (!confirm("Kural silinsin mi?")) return;
    const r = await adminApi("DELETE", `/api/admin/meeting-rules/${id}`);
    setMsg(r.ok ? "Kural silindi." : r.message);
    if (r.ok) router.refresh();
  }

  const selInfo = info(sel);
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {EXPERT_IDS.map((id) => <button key={id} className={`btn ${expert === id ? "btn-primary" : "btn-secondary"}`} onClick={() => setExpert(id)} aria-pressed={expert === id}>{EXPERTS[id].name}</button>)}
      </div>
      {msg && <p role="status" style={{ margin: 0 }}>{msg}</p>}

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <button className="btn btn-secondary" onClick={() => step(-1)} aria-label="Önceki ay">←</button>
          <strong style={{ minWidth: 150, textAlign: "center" }}>{MONTH[ym.m]} {ym.y}</strong>
          <button className="btn btn-secondary" onClick={() => step(1)} aria-label="Sonraki ay">→</button>
          <span style={{ fontSize: 13, color: "var(--muted-72)" }}>🟩 müsait · 🟥 müsait değil · ● görüşme</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
          {WEEK.map((w) => <div key={w} style={{ fontSize: 13, color: "var(--muted-72)", padding: 4 }}>{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const x = info(d);
            return (
              <button key={d} onClick={() => setSel(d)} aria-pressed={sel === d} aria-label={d}
                style={{ textAlign: "left", minHeight: 64, padding: 6, font: "inherit", cursor: "pointer", background: x.block ? "#fdecec" : x.avail ? "#e8f6ec" : "#fff", border: `${sel === d ? 2 : 1}px solid ${sel === d ? "var(--color-accent)" : "var(--color-divider)"}` }}>
                <div style={{ fontSize: 14, fontWeight: d === today ? 700 : 400 }}>{Number(d.slice(8))}</div>
                {x.meets.length > 0 && <div style={{ fontSize: 12, color: "var(--color-accent)" }}>● {x.meets.length}</div>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="meet-panel" style={{ margin: 0, maxWidth: "none" }}>
        <h3 style={{ fontSize: 22, marginBottom: 8 }}>{sel}</h3>
        {mine.filter((r) => ruleCoversDay(r, sel)).map((r) => <div key={r.id}>{ruleText(r)}</div>)}
        {!selInfo.avail && !selInfo.block && <div style={{ color: "var(--muted-72)" }}>Bu gün için kural yok.</div>}
        {selInfo.meets.map((m) => <div key={m.id}>● {m.startsAt.slice(11, 16)}–{m.endsAt.slice(11, 16)} · {m.fullName} · {m.status === "confirmed" ? "onaylı" : m.status === "accepted" ? "kabul edildi" : "bekliyor"}</div>)}
      </div>

      <form onSubmit={addRule} className="meet-panel" style={{ margin: 0, maxWidth: "none", display: "grid", gap: 12 }}>
        <h3 style={{ fontSize: 22 }}>Kural ekle — {EXPERTS[expert].name}</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select className="input" aria-label="Tür" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Rule["kind"] })} style={{ width: "auto" }}><option value="available">Müsait</option><option value="blocked">Müsait değil</option></select>
          <select className="input" aria-label="Tekrar" value={f.recurrence} onChange={(e) => setF({ ...f, recurrence: e.target.value as Rule["recurrence"] })} style={{ width: "auto" }}>{Object.entries(REC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input className="input" type="time" step={900} required aria-label="Başlangıç saati" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} style={{ width: "auto" }} />
          <input className="input" type="time" step={900} required aria-label="Bitiş saati" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} style={{ width: "auto" }} />
        </div>
        {f.recurrence === "once" ? (
          <label>Tarih <input className="input" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={{ width: "auto" }} /></label>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label>Başlangıç günü <input className="input" type="date" required value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} style={{ width: "auto" }} /></label>
            <label>Bitiş (isteğe bağlı) <input className="input" type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} style={{ width: "auto" }} /></label>
            {f.recurrence === "monthly" && <span style={{ fontSize: 13, color: "var(--muted-72)" }}>Başlangıç gününün ay günü her ay tekrarlanır (o gün yoksa ay atlanır).</span>}
          </div>
        )}
        {f.recurrence === "weekly" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {WEEK.map((w, i) => <label key={w}><input type="checkbox" checked={(f.weekdays & (1 << i)) !== 0} onChange={() => setF({ ...f, weekdays: f.weekdays ^ (1 << i) })} /> {w}</label>)}
          </div>
        )}
        <input className="input" maxLength={200} placeholder="Not (isteğe bağlı)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="btn btn-primary" style={{ justifySelf: "start" }}>Kuralı ekle</button>
      </form>

      <div>
        <h3 style={{ fontSize: 22, marginBottom: 8 }}>Tüm kurallar — {EXPERTS[expert].name}</h3>
        {mine.length === 0 ? <p>Henüz kural yok; kural eklenene kadar ziyaretçiler bu uzman için saat seçemez.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {mine.map((r) => <li key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><span>{ruleText(r)}{r.note ? ` — ${r.note}` : ""}</span><button className="btn btn-ghost" onClick={() => del(r.id)}>Sil</button></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

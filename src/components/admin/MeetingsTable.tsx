"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EXPERTS } from "@/data/experts";
import { formatWhen } from "@/lib/meeting-format";
import type { MeetingRow } from "@/lib/meetings";
import { STATUS_LABEL } from "@/components/meetings/MeetingSummary";
import { adminApi } from "./api";

type Edit = { id: number; date: string; time: string; url: string };

export function MeetingsTable({ meetings }: { meetings: MeetingRow[] }) {
  const router = useRouter();
  const [expert, setExpert] = useState("");
  const [status, setStatus] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = meetings.filter((m) => (!expert || m.expert === expert) && (!status || m.status === status));

  async function act(id: number, body: Record<string, unknown>) {
    setBusy(true); setMsg("");
    const r = await adminApi("PATCH", `/api/admin/meetings/${id}`, body);
    setBusy(false);
    setMsg(r.ok ? "Kaydedildi; ziyaretçiye bilgilendirme maili gönderildi." : r.message);
    if (r.ok) { setEdit(null); router.refresh(); }
  }
  const open = (m: MeetingRow) => setEdit({ id: m.id, date: m.startsAt.slice(0, 10), time: m.startsAt.slice(11, 16), url: m.meetingUrl ?? "" });

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <select className="input" aria-label="Uzman" value={expert} onChange={(e) => setExpert(e.target.value)} style={{ width: "auto" }}>
          <option value="">Tüm uzmanlar</option>
          {Object.values(EXPERTS).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select className="input" aria-label="Durum" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}>
          <option value="">Tüm durumlar</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {msg && <p role="status" style={{ margin: "0 0 12px" }}>{msg}</p>}
      {rows.length === 0 ? <p>Kayıt yok.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-divider)" }}>
              <th style={{ padding: 8 }}>Zaman</th><th>Uzman</th><th>Ziyaretçi</th><th>Durum</th><th>İşlem</th>
            </tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--color-divider)", verticalAlign: "top" }}>
                  <td style={{ padding: 8 }}>{formatWhen(m.startsAt)}<br /><span style={{ color: "var(--muted-72)" }}>{m.durationMin} dk{m.proposedStartsAt ? ` · öneri: ${formatWhen(m.proposedStartsAt)}` : ""}</span></td>
                  <td>{EXPERTS[m.expert].name}</td>
                  <td><strong>{m.fullName}</strong><br />{m.company} · {m.jobTitle}<br /><a href={`mailto:${m.email}`}>{m.email}</a></td>
                  <td>{STATUS_LABEL[m.status]}{m.decisionNote && <><br /><span style={{ color: "var(--muted-72)" }}>Not: {m.decisionNote}</span></>}{m.meetingUrl && <><br /><a href={m.meetingUrl} target="_blank" rel="noopener noreferrer">Bağlantı</a></>}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {m.status === "pending" && (<>
                        <button className="btn btn-primary" disabled={busy} style={{ fontSize: 13, padding: "6px 10px" }} onClick={() => act(m.id, { action: "accept" })}>Kabul</button>
                        <button className="btn btn-secondary" disabled={busy} style={{ fontSize: 13, padding: "6px 10px" }} onClick={() => act(m.id, { action: "decline" })}>Reddet</button>
                      </>)}
                      {(m.status === "accepted" || m.status === "confirmed") && <button className="btn btn-secondary" disabled={busy} style={{ fontSize: 13, padding: "6px 10px" }} onClick={() => open(m)}>{m.status === "accepted" ? "Bağlantı gir" : "Düzenle"}</button>}
                      {["pending", "counter_proposed", "accepted", "confirmed"].includes(m.status) && (
                        <button className="btn btn-secondary" disabled={busy} style={{ fontSize: 13, padding: "6px 10px" }} onClick={() => { if (confirm("Görüşme iptal edilsin mi? Ziyaretçiye mail gider.")) act(m.id, { action: "cancel" }); }}>İptal</button>
                      )}
                    </div>
                    {edit?.id === m.id && (
                      <form onSubmit={(e) => { e.preventDefault(); const base = { meetingUrl: edit.url || undefined }; act(m.id, m.status === "accepted" ? { action: "set_link", ...base } : { action: "update", startsAt: `${edit.date} ${edit.time}:00`, ...base }); }} style={{ display: "grid", gap: 6, marginTop: 8, minWidth: 240 }}>
                        {m.status === "confirmed" && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <input className="input" type="date" required value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
                            <input className="input" type="time" step={900} required value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} />
                          </div>
                        )}
                        <input className="input" type="url" required={m.status === "accepted"} placeholder="https://… toplantı bağlantısı" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-primary" disabled={busy} style={{ fontSize: 13, padding: "6px 10px" }}>Kaydet ve bildir</button>
                          <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Vazgeç</button>
                        </div>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

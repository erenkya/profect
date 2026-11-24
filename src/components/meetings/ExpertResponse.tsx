"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormMessage } from "@/components/auth/AuthShell";
import type { MeetingRow } from "@/lib/meetings";
import { patchMeeting } from "./patch-meeting";

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const label = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/** Uzman yanıt kutusu: durum pending → kabul/ret/öneri; accepted → toplantı linki. Diğer durumlarda sadece bilgi. */
export function ExpertResponse({ token, meeting: m }: { token: string; meeting: Pick<MeetingRow, "status" | "expert" | "durationMin" | "meetingUrl"> }) {
  const router = useRouter();
  const [mode, setMode] = useState<"" | "decline" | "counter">("");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState(m.meetingUrl ?? "");
  const [days, setDays] = useState<string[] | null>(null);
  const [day, setDay] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "counter") return;
    let live = true;
    fetch(`/api/gorusme/slots?expert=${m.expert}&duration=${m.durationMin}`).then((r) => r.json()).then((j) => live && setDays(j.days ?? []));
    return () => { live = false; };
  }, [mode, m.expert, m.durationMin]);
  useEffect(() => {
    if (!day) return;
    let live = true;
    setSlots(null); setSlot("");
    fetch(`/api/gorusme/slots?expert=${m.expert}&duration=${m.durationMin}&day=${day}`).then((r) => r.json()).then((j) => live && setSlots(j.slots ?? []));
    return () => { live = false; };
  }, [day, m.expert, m.durationMin]);

  async function act(body: Parameters<typeof patchMeeting>[1]) {
    setBusy(true); setError("");
    const r = await patchMeeting(token, body);
    setBusy(false);
    if (r.ok) router.refresh(); else setError(r.message);
  }

  if (m.status === "accepted") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); act({ action: "set_link", meetingUrl: url }); }} style={{ display: "grid", gap: 14 }}>
        <p style={{ margin: 0 }}>Talebi kabul ettiniz. Lütfen toplantıyı oluşturup bağlantısını girin; davet ziyaretçiye otomatik gönderilecek.</p>
        <div className="field"><label htmlFor="mt-url">Toplantı bağlantısı (https://…)</label><input id="mt-url" className="input" type="url" required placeholder="https://meet.google.com/…" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        {error && <FormMessage kind="error">{error}</FormMessage>}
        <button className="btn btn-primary" disabled={busy} style={{ justifySelf: "start" }}>{busy ? "Gönderiliyor…" : "Daveti Gönder"}</button>
      </form>
    );
  }
  if (m.status !== "pending") return null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => act({ action: "accept" })}>Kabul Et</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => setMode(mode === "counter" ? "" : "counter")}>Başka Saat Öner</button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => setMode(mode === "decline" ? "" : "decline")}>Reddet</button>
      </div>

      {mode === "decline" && (
        <form onSubmit={(e) => { e.preventDefault(); act({ action: "decline", note: note || undefined }); }} style={{ display: "grid", gap: 10 }}>
          <div className="field"><label htmlFor="mt-note">Not (isteğe bağlı, ziyaretçiye iletilir)</label><input id="mt-note" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button className="btn btn-primary" disabled={busy} style={{ justifySelf: "start" }}>Reddi Onayla</button>
        </form>
      )}

      {mode === "counter" && (
        <div style={{ display: "grid", gap: 12 }}>
          <strong>Önerilecek gün</strong>
          {days === null ? <span>Yükleniyor…</span> : days.length === 0 ? <span>Uygun gün yok.</span> :
            <div className="meet-scroll">{days.map((d) => <button key={d} type="button" className={`meet-chip${day === d ? " meet-chip-on" : ""}`} onClick={() => setDay(d)}>{label(d)}</button>)}</div>}
          {day && (<>
            <strong>Saat</strong>
            {slots === null ? <span>Yükleniyor…</span> : slots.length === 0 ? <span>Boş saat yok.</span> :
              <div className="meet-set">{slots.map((s) => <button key={s} type="button" className={`meet-chip${slot === s ? " meet-chip-on" : ""}`} onClick={() => setSlot(s)}>{s}</button>)}</div>}
          </>)}
          <div className="field"><label htmlFor="mt-cnote">Not (isteğe bağlı)</label><input id="mt-cnote" className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button className="btn btn-primary" disabled={busy || !day || !slot} style={{ justifySelf: "start" }} onClick={() => act({ action: "counter", startsAt: `${day} ${slot}:00`, note: note || undefined })}>Öneriyi Gönder</button>
        </div>
      )}
      {error && <FormMessage kind="error">{error}</FormMessage>}
    </div>
  );
}

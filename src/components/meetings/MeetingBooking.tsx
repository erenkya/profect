"use client";

import { useEffect, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { FormMessage } from "@/components/auth/AuthShell";

type Expert = { id: "kaan" | "tugrul"; name: string; role: string; photo: string; topics: string[]; available: boolean };
type Props = { expert: Expert; siteKey: string; prefill: { name: string; email: string } | null };

const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const dayLabel = (d: string) => `${DAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

async function getJson(url: string) {
  const res = await fetch(url);
  return (await res.json().catch(() => null)) as { success?: boolean; days?: string[]; slots?: string[]; message?: string } | null;
}

export function MeetingBooking({ expert, siteKey, prefill }: Props) {
  const expertId = expert.id;
  const [duration, setDuration] = useState<15 | 30 | null>(null);
  const [days, setDays] = useState<string[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: prefill?.name ?? "", email: prefill?.email ?? "", company: "", jobTitle: "" });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!duration) return;
    let live = true;
    setDays(null); setDay(null); setSlots(null); setSlot(null);
    getJson(`/api/gorusme/slots?expert=${expertId}&duration=${duration}`).then((j) => { if (live) setDays(j?.days ?? []); });
    return () => { live = false; };
  }, [expertId, duration]);

  useEffect(() => {
    if (!duration || !day) return;
    let live = true;
    setSlots(null); setSlot(null);
    getJson(`/api/gorusme/slots?expert=${expertId}&duration=${duration}&day=${day}`).then((j) => { if (live) setSlots(j?.slots ?? []); });
    return () => { live = false; };
  }, [expertId, duration, day]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!duration || !day || !slot) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/gorusme", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expert: expertId, durationMin: duration, startsAt: `${day} ${slot}:00`, ...form, turnstileToken: token }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.success) setDone(true);
      else { setError(j?.message ?? "Talep gönderilemedi. Lütfen tekrar deneyin."); if (res.status === 409) setDay((d) => d); }
    } catch { setError("Bağlantı hatası. Lütfen tekrar deneyin."); }
    setBusy(false);
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const chip = (active: boolean) => `meet-chip${active ? " meet-chip-on" : ""}`;

  if (done) {
    return (
      <div className="meet-panel" role="status" style={{ textAlign: "center" }}>
        <h3 style={{ fontSize: 28, marginBottom: 8 }}>Talebiniz alındı</h3>
        <p style={{ margin: 0 }}>{expert.name} için görüşme talebinizi ilettik. <strong>{form.email}</strong> adresine bir onay e-postası gönderdik; yanıt geldiğinde yine e-posta ile bilgilendirileceksiniz.</p>
      </div>
    );
  }

  return (
    <div>
      {(
        <div className="meet-panel">
          <h3 style={{ fontSize: 26, marginBottom: 16 }}>Görüşme bilgileri</h3>
          {!expert.available ? (
            <p style={{ margin: 0 }}>Bu uzmanın takvimi henüz açılmadı. Lütfen daha sonra tekrar bakın.</p>
          ) : (
            <form onSubmit={submit} style={{ display: "grid", gap: 20 }}>
              <fieldset className="meet-set"><legend>1. Görüşme süresi</legend>
                {([15, 30] as const).map((d) => <button key={d} type="button" className={chip(duration === d)} aria-pressed={duration === d} onClick={() => setDuration(d)}>{d} dakika</button>)}
              </fieldset>

              {duration && (
                <fieldset className="meet-set"><legend>2. Gün</legend>
                  {days === null ? <span>Yükleniyor…</span> : days.length === 0 ? <span>Şu an uygun gün yok.</span> :
                    <div className="meet-scroll">{days.map((d) => <button key={d} type="button" className={chip(day === d)} aria-pressed={day === d} onClick={() => setDay(d)}>{dayLabel(d)}</button>)}</div>}
                </fieldset>
              )}

              {day && (
                <fieldset className="meet-set"><legend>3. Saat (İstanbul saati)</legend>
                  {slots === null ? <span>Yükleniyor…</span> : slots.length === 0 ? <span>Bu gün için boş saat kalmadı.</span> :
                    slots.map((s) => <button key={s} type="button" className={chip(slot === s)} aria-pressed={slot === s} onClick={() => setSlot(s)}>{s}</button>)}
                </fieldset>
              )}

              {slot && (
                <>
                  <div className="meet-fields">
                    <div className="field"><label htmlFor="mt-name">Ad soyad</label><input id="mt-name" className="input" required minLength={2} maxLength={100} autoComplete="name" value={form.fullName} onChange={set("fullName")} /></div>
                    <div className="field"><label htmlFor="mt-email">Şirket e-posta adresi</label><input id="mt-email" className="input" type="email" required maxLength={190} autoComplete="email" value={form.email} onChange={set("email")} /></div>
                    <div className="field"><label htmlFor="mt-company">Şirket</label><input id="mt-company" className="input" required minLength={2} maxLength={150} autoComplete="organization" value={form.company} onChange={set("company")} /></div>
                    <div className="field"><label htmlFor="mt-role">Şirketteki rolünüz</label><input id="mt-role" className="input" required minLength={2} maxLength={100} autoComplete="organization-title" value={form.jobTitle} onChange={set("jobTitle")} /></div>
                  </div>
                  {siteKey && <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken("")} options={{ theme: "light" }} />}
                  {error && <FormMessage kind="error">{error}</FormMessage>}
                  <button type="submit" className="btn btn-primary" disabled={busy || (!!siteKey && !token)} style={{ fontSize: 17, padding: 13, justifySelf: "start" }}>{busy ? "Gönderiliyor…" : "Onaya Gönder"}</button>
                </>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Corners } from "@/components/Corners";
import { FormMessage } from "@/components/auth/AuthShell";
import { adminApi } from "./api";

type Opt = { option_text: string; is_correct: boolean };
type Q = { question_text: string; explanation: string; options: Opt[] };
type Props = { quizId: number; courseSlug: string; courseId: number; initial: { title: string; passing: number; duration: number | null; questions: Q[] } };

const blankQ = (): Q => ({ question_text: "", explanation: "", options: [{ option_text: "", is_correct: true }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }] });

export function QuizEditor({ quizId, courseId, initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [passing, setPassing] = useState(String(initial.passing));
  const [duration, setDuration] = useState(initial.duration == null ? "" : String(initial.duration));
  const [qs, setQs] = useState<Q[]>(initial.questions.length ? initial.questions : [blankQ()]);
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const setQ = (i: number, patch: Partial<Q>) => setQs((a) => a.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const setOpt = (i: number, j: number, patch: Partial<Opt>) => setQ(i, { options: qs[i].options.map((o, k) => (k === j ? { ...o, ...patch } : o)) });
  const markCorrect = (i: number, j: number) => setQ(i, { options: qs[i].options.map((o, k) => ({ ...o, is_correct: k === j })) });

  async function save() {
    if (!(Number(duration) >= 1)) {
      setFlash({ kind: "error", text: "Sınav süresi (dk) zorunlu." });
      return;
    }
    // Boş bırakılan şıklar kaydedilmez; en az 2 dolu şık ve 1 doğru şık gerekir.
    const cleaned = qs
      .map((q) => ({ question_text: q.question_text.trim(), explanation: q.explanation.trim(), options: q.options.filter((o) => o.option_text.trim()).map((o) => ({ ...o, option_text: o.option_text.trim() })) }))
      .filter((q) => q.question_text);
    setBusy(true);
    const r = await adminApi("PUT", `/api/admin/quizzes/${quizId}`, { title, passing_score_percentage: Number(passing) || 70, duration_minutes: Number(duration), questions: cleaned });
    setBusy(false);
    setFlash({ kind: r.ok ? "ok" : "error", text: r.ok ? "Sınav kaydedildi." : r.message });
    if (r.ok) router.refresh();
  }

  const input = { background: "#fff", fontSize: 15, minHeight: 38 } as const;
  return (
    <div style={{ maxWidth: 860 }}>
      <Link href={`/admin/kurslar/${courseId}`} style={{ fontSize: 14 }}>← Kursa dön</Link>
      <h1 style={{ fontSize: 48, textTransform: "uppercase", margin: "12px 0 20px" }}>Sınav düzenle</h1>
      {flash && <div style={{ marginBottom: 16 }}><FormMessage kind={flash.kind}>{flash.text}</FormMessage></div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 14, marginBottom: 28 }}>
        <div className="field"><label>Başlık</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={input} /></div>
        <div className="field"><label>Geçme notu (%)</label><input className="input" type="number" min={1} max={100} value={passing} onChange={(e) => setPassing(e.target.value)} style={input} /></div>
        <div className="field"><label>Süre (dk)</label><input className="input" type="number" min={1} required value={duration} onChange={(e) => setDuration(e.target.value)} style={input} /></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {qs.map((q, i) => (
          <div key={i} className="card blueprint" style={{ background: "#fff", padding: 20, gap: 12 }}>
            <Corners />
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 600, color: "var(--color-accent)" }}>{String(i + 1).padStart(2, "0")}</span>
              <textarea className="input" rows={2} placeholder="Soru metni" value={q.question_text} onChange={(e) => setQ(i, { question_text: e.target.value })} style={{ background: "#fff", fontSize: 15, flex: 1 }} />
              <button className="btn btn-icon btn-secondary" aria-label="Soruyu sil" style={{ width: 32, height: 32 }} onClick={() => setQs((a) => a.filter((_, k) => k !== i))}><Trash2 size={15} strokeWidth={1.5} /></button>
            </div>
            {q.options.map((o, j) => (
              <label key={j} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="radio" name={`correct-${i}`} checked={o.is_correct} onChange={() => markCorrect(i, j)} aria-label={`Şık ${j + 1} doğru cevap`} />
                <input className="input" placeholder={`Şık ${j + 1}`} value={o.option_text} onChange={(e) => setOpt(i, j, { option_text: e.target.value })} style={input} />
              </label>
            ))}
            <div style={{ fontSize: 12, color: "var(--muted-55)" }}>Doğru şıkkı soldaki seçenekle işaretleyin. Boş şıklar kaydedilmez.</div>
            <div className="field" style={{ marginTop: 4 }}>
              <label htmlFor={`explanation-${i}`}>Açıklama <span style={{ fontWeight: 400, color: "var(--muted-55)" }}>(isteğe bağlı · öğrenci yanlış cevaplarsa gösterilir)</span></label>
              <textarea id={`explanation-${i}`} className="input" rows={2} maxLength={5000} placeholder="Örn. Doğru cevap neden B? Konunun kısa açıklaması…" value={q.explanation} onChange={(e) => setQ(i, { explanation: e.target.value })} style={{ background: "#fff", fontSize: 15 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={() => setQs((a) => [...a, blankQ()])}>+ Soru ekle</button>
        <button className="btn btn-primary blueprint" disabled={busy} onClick={save}><Corners />{busy ? "Kaydediliyor…" : "Sınavı kaydet"}</button>
      </div>
    </div>
  );
}

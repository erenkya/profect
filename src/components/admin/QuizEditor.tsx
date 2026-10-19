"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { z } from "zod";
import { Corners } from "@/components/Corners";
import { FormMessage } from "@/components/auth/AuthShell";
import type { quizSchema } from "@/lib/admin-schemas";
import { adminApi } from "./api";
import { ChoiceEditor, blankChoice, switchChoiceKind, type ChoiceQ, type EditorItem } from "./quiz/ChoiceEditor";
import { CategorizeEditor, blankCategorize } from "./quiz/CategorizeEditor";
import { ScenarioEditor, blankScenario } from "./quiz/ScenarioEditor";

type QuizInputQuestions = z.infer<typeof quizSchema>["questions"];
type Props = { quizId: number; courseSlug: string; courseId: number; initial: { title: string; passing: number; duration: number | null; questions: QuizInputQuestions } };
type ItemKind = "single" | "multiple" | "categorize";

const KIND_LABEL: Record<EditorItem["kind"], string> = { single: "Tek cevaplı", multiple: "Çok cevaplı", categorize: "Sürükle-bırak", scenario: "Senaryo" };

/** Sunucudan gelen girdi → editör durumu (isteğe bağlı alanlar boş metin olur). */
function toEditor(q: QuizInputQuestions[number]): EditorItem {
  if (q.kind === "scenario") return { kind: "scenario", scenario_text: q.scenario_text, scenario_prompt: q.scenario_prompt ?? "", questions: q.questions.map((c) => ({ ...c, explanation: c.explanation ?? "" })) };
  return { ...q, explanation: q.explanation ?? "" };
}

const cleanChoice = (q: ChoiceQ) => ({
  kind: q.kind,
  question_text: q.question_text.trim(),
  explanation: q.explanation.trim(),
  options: q.options.filter((o) => o.option_text.trim()).map((o) => ({ ...o, option_text: o.option_text.trim() })),
});

/** Kaydetmeden önce: boş şık/kart ve metinsiz sorular atılır; doğrulamanın kalanı sunucuda. */
function clean(items: EditorItem[]) {
  return items
    .map((q) => {
      if (q.kind === "scenario") return { ...q, scenario_text: q.scenario_text.trim(), scenario_prompt: q.scenario_prompt.trim(), questions: q.questions.map(cleanChoice).filter((c) => c.question_text) };
      if (q.kind === "categorize") return { ...q, question_text: q.question_text.trim(), explanation: q.explanation.trim(), categories: q.categories.map((c) => c.trim()), cards: q.cards.filter((c) => c.card_text.trim()).map((c) => ({ ...c, card_text: c.card_text.trim() })) };
      return cleanChoice(q);
    })
    .filter((q) => (q.kind === "scenario" ? q.scenario_text : q.question_text));
}

/** Soru tipi değişimi: metin ve açıklama korunur. */
function changeKind(q: Exclude<EditorItem, { kind: "scenario" }>, kind: ItemKind): EditorItem {
  if (kind === q.kind) return q;
  if (kind === "categorize") return { ...blankCategorize(), question_text: q.question_text, explanation: q.explanation };
  if (q.kind === "categorize") return { ...blankChoice(kind), question_text: q.question_text, explanation: q.explanation };
  return switchChoiceKind(q, kind);
}

export function QuizEditor({ quizId, courseId, initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [passing, setPassing] = useState(String(initial.passing));
  const [duration, setDuration] = useState(initial.duration == null ? "" : String(initial.duration));
  const [qs, setQs] = useState<EditorItem[]>(initial.questions.length ? initial.questions.map(toEditor) : [blankChoice()]);
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const setQ = (i: number, q: EditorItem) => setQs((a) => a.map((x, k) => (k === i ? q : x)));
  const moveQ = (i: number, d: -1 | 1) =>
    setQs((a) => {
      const b = [...a];
      [b[i], b[i + d]] = [b[i + d], b[i]];
      return b;
    });

  async function save() {
    if (!(Number(duration) >= 1)) {
      setFlash({ kind: "error", text: "Sınav süresi (dk) zorunlu." });
      return;
    }
    setBusy(true);
    const r = await adminApi("PUT", `/api/admin/quizzes/${quizId}`, { title, passing_score_percentage: Number(passing) || 70, duration_minutes: Number(duration), questions: clean(qs) });
    setBusy(false);
    setFlash({ kind: r.ok ? "ok" : "error", text: r.ok ? "Sınav kaydedildi." : r.message });
    if (r.ok) router.refresh();
  }

  // Puanlanan soru numarası: senaryo kendisi sayılmaz, alt soruları sayılır.
  let scored = 0;

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
        {qs.map((q, i) => {
          const from = scored + 1;
          scored += q.kind === "scenario" ? q.questions.length : 1;
          const number = q.kind === "scenario" ? (q.questions.length > 1 ? `${String(from).padStart(2, "0")}–${String(scored).padStart(2, "0")}` : String(from).padStart(2, "0")) : String(from).padStart(2, "0");
          return (
            <div key={i} className="card blueprint" style={{ background: "#fff", padding: 20, gap: 12, borderLeft: q.kind === "scenario" ? "3px solid var(--color-accent-2)" : undefined }}>
              <Corners />
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 600, color: "var(--color-accent)" }}>{number}</span>
                {q.kind === "scenario" ? (
                  <span className="tag" style={{ fontSize: 12 }}>{KIND_LABEL.scenario} · {q.questions.length} soru</span>
                ) : (
                  <select className="input" aria-label={`Soru ${from} tipi`} value={q.kind} onChange={(e) => setQ(i, changeKind(q, e.target.value as ItemKind))} style={{ background: "#fff", fontSize: 14, minHeight: 34 }}>
                    <option value="single">{KIND_LABEL.single}</option>
                    <option value="multiple">{KIND_LABEL.multiple}</option>
                    <option value="categorize">{KIND_LABEL.categorize}</option>
                  </select>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button type="button" className="btn btn-icon btn-secondary" aria-label="Yukarı taşı" disabled={i === 0} style={{ width: 32, height: 32 }} onClick={() => moveQ(i, -1)}><ChevronUp size={15} strokeWidth={1.5} /></button>
                  <button type="button" className="btn btn-icon btn-secondary" aria-label="Aşağı taşı" disabled={i === qs.length - 1} style={{ width: 32, height: 32 }} onClick={() => moveQ(i, 1)}><ChevronDown size={15} strokeWidth={1.5} /></button>
                  <button type="button" className="btn btn-icon btn-secondary" aria-label={q.kind === "scenario" ? "Senaryoyu sil" : "Soruyu sil"} style={{ width: 32, height: 32 }} onClick={() => setQs((a) => a.filter((_, k) => k !== i))}><Trash2 size={15} strokeWidth={1.5} /></button>
                </div>
              </div>
              {q.kind === "scenario" ? (
                <ScenarioEditor idPrefix={`q${i}`} value={q} onChange={(v) => setQ(i, v)} />
              ) : q.kind === "categorize" ? (
                <CategorizeEditor idPrefix={`q${i}`} value={q} onChange={(v) => setQ(i, v)} />
              ) : (
                <ChoiceEditor idPrefix={`q${i}`} value={q} onChange={(v) => setQ(i, v)} />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={() => setQs((a) => [...a, blankChoice()])}>+ Soru ekle</button>
        <button className="btn btn-secondary" onClick={() => setQs((a) => [...a, blankScenario()])}>+ Senaryo ekle</button>
        <button className="btn btn-primary blueprint" disabled={busy} onClick={save}><Corners />{busy ? "Kaydediliyor…" : "Sınavı kaydet"}</button>
      </div>
    </div>
  );
}

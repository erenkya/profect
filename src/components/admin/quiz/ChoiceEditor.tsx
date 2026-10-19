"use client";

import { Trash2 } from "lucide-react";

export type Opt = { option_text: string; is_correct: boolean };
export type ChoiceQ = { kind: "single" | "multiple"; question_text: string; explanation: string; options: Opt[] };
export type CatQ = { kind: "categorize"; question_text: string; explanation: string; categories: string[]; cards: { card_text: string; category_index: number }[] };
export type ScenQ = { kind: "scenario"; scenario_text: string; scenario_prompt: string; questions: ChoiceQ[] };
export type EditorItem = ChoiceQ | CatQ | ScenQ;

const MAX_OPTIONS = 12;
export const input = { background: "#fff", fontSize: 15, minHeight: 38 } as const;

export const blankChoice = (kind: ChoiceQ["kind"] = "single"): ChoiceQ => ({
  kind,
  question_text: "",
  explanation: "",
  options: [{ option_text: "", is_correct: true }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }, { option_text: "", is_correct: false }],
});

/** Açıklama alanı (tüm puanlanan soru tiplerinde ortak). */
export function ExplanationField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field" style={{ marginTop: 4 }}>
      <label htmlFor={id}>Açıklama <span style={{ fontWeight: 400, color: "var(--muted-55)" }}>(isteğe bağlı · öğrenci yanlış cevaplarsa gösterilir)</span></label>
      <textarea id={id} className="input" rows={2} maxLength={5000} placeholder="Örn. Doğru cevap neden B? Konunun kısa açıklaması…" value={value} onChange={(e) => onChange(e.target.value)} style={{ background: "#fff", fontSize: 15 }} />
    </div>
  );
}

/** Tek / çok cevaplı soru gövdesi: soru metni, şıklar, doğru işaretleri ve açıklama. */
export function ChoiceEditor({ idPrefix, value: q, onChange }: { idPrefix: string; value: ChoiceQ; onChange: (q: ChoiceQ) => void }) {
  const multi = q.kind === "multiple";
  const setOpt = (j: number, patch: Partial<Opt>) => onChange({ ...q, options: q.options.map((o, k) => (k === j ? { ...o, ...patch } : o)) });
  const toggleCorrect = (j: number) =>
    onChange({ ...q, options: q.options.map((o, k) => (multi ? (k === j ? { ...o, is_correct: !o.is_correct } : o) : { ...o, is_correct: k === j })) });

  return (
    <>
      <textarea className="input" rows={2} placeholder="Soru metni" value={q.question_text} onChange={(e) => onChange({ ...q, question_text: e.target.value })} style={{ background: "#fff", fontSize: 15 }} />
      {q.options.map((o, j) => (
        <div key={j} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type={multi ? "checkbox" : "radio"}
            name={`${idPrefix}-correct`}
            checked={o.is_correct}
            onChange={() => toggleCorrect(j)}
            aria-label={`Şık ${j + 1} doğru cevap`}
          />
          <input className="input" placeholder={`Şık ${j + 1}`} value={o.option_text} onChange={(e) => setOpt(j, { option_text: e.target.value })} style={{ ...input, flex: 1 }} />
          {q.options.length > 2 && (
            <button type="button" className="btn btn-icon btn-secondary" aria-label={`Şık ${j + 1}'i sil`} style={{ width: 32, height: 32 }} onClick={() => onChange({ ...q, options: q.options.filter((_, k) => k !== j) })}>
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--muted-55)" }}>
          {multi ? `Doğru şıkları işaretleyin (${q.options.filter((o) => o.is_correct).length} doğru). Öğrenciye kaç doğru olduğu söylenir.` : "Doğru şıkkı soldaki seçenekle işaretleyin."} Boş şıklar kaydedilmez.
        </span>
        {q.options.length < MAX_OPTIONS && (
          <button type="button" className="btn btn-ghost" style={{ padding: "4px 0", fontSize: 14 }} onClick={() => onChange({ ...q, options: [...q.options, { option_text: "", is_correct: false }] })}>
            + Şık ekle
          </button>
        )}
      </div>
      <ExplanationField id={`${idPrefix}-explanation`} value={q.explanation} onChange={(explanation) => onChange({ ...q, explanation })} />
    </>
  );
}

/** Tek ↔ çok cevaplı geçişi: tek cevaplıya dönerken yalnızca ilk doğru şık korunur. */
export function switchChoiceKind(q: ChoiceQ, kind: ChoiceQ["kind"]): ChoiceQ {
  if (kind === q.kind) return q;
  if (kind === "multiple") return { ...q, kind };
  const first = q.options.findIndex((o) => o.is_correct);
  return { ...q, kind, options: q.options.map((o, k) => ({ ...o, is_correct: k === Math.max(first, 0) })) };
}

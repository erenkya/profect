"use client";

import { Trash2 } from "lucide-react";
import { blankChoice, switchChoiceKind, type ChoiceQ, type ScenQ } from "@/lib/quiz-editor";
import { ChoiceEditor } from "./ChoiceEditor";

export const blankScenario = (): ScenQ => ({ kind: "scenario", scenario_text: "", scenario_prompt: "", questions: [blankChoice()] });

/** Senaryo: metin, isteğe bağlı senaryo sorusu ve tek/çok cevaplı alt sorular (her biri ayrı puanlanır). */
export function ScenarioEditor({ idPrefix, value: s, onChange }: { idPrefix: string; value: ScenQ; onChange: (s: ScenQ) => void }) {
  const setChild = (i: number, q: ChoiceQ) => onChange({ ...s, questions: s.questions.map((x, k) => (k === i ? q : x)) });
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-text`}>Senaryo metni</label>
        <textarea id={`${idPrefix}-text`} className="input" rows={5} placeholder="Öğrencinin okuyacağı durum / vaka…" value={s.scenario_text} onChange={(e) => onChange({ ...s, scenario_text: e.target.value })} style={{ background: "#fff", fontSize: 15 }} />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-prompt`}>Senaryo sorusu <span style={{ fontWeight: 400, color: "var(--muted-55)" }}>(isteğe bağlı · puanlanmaz, alt soruların üstünde gösterilir)</span></label>
        <input id={`${idPrefix}-prompt`} className="input" placeholder="Örn. Bu durumda proje yöneticisi olarak ne yaparsınız?" value={s.scenario_prompt} onChange={(e) => onChange({ ...s, scenario_prompt: e.target.value })} style={{ background: "#fff", fontSize: 15, minHeight: 38 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {s.questions.map((q, i) => (
          <div key={i} style={{ borderLeft: "3px solid var(--color-accent-2)", paddingLeft: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600 }}>Alt soru {i + 1}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select className="input" aria-label={`Alt soru ${i + 1} tipi`} value={q.kind} onChange={(e) => setChild(i, switchChoiceKind(q, e.target.value as ChoiceQ["kind"]))} style={{ background: "#fff", fontSize: 14, minHeight: 32 }}>
                  <option value="single">Tek cevaplı</option>
                  <option value="multiple">Çok cevaplı</option>
                </select>
                {s.questions.length > 1 && (
                  <button type="button" className="btn btn-icon btn-secondary" aria-label={`Alt soru ${i + 1}'i sil`} style={{ width: 32, height: 32 }} onClick={() => onChange({ ...s, questions: s.questions.filter((_, k) => k !== i) })}>
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </div>
            <ChoiceEditor idPrefix={`${idPrefix}-${i}`} value={q} onChange={(nq) => setChild(i, nq)} />
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary" style={{ alignSelf: "flex-start" }} onClick={() => onChange({ ...s, questions: [...s.questions, blankChoice()] })}>
        + Alt soru ekle
      </button>
    </>
  );
}

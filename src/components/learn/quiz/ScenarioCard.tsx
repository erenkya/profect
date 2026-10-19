"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import type { ScenarioRef } from "@/lib/quiz-model";

const COLLAPSE_AT = 600; // karakter: daha uzun senaryolar daraltılmış başlar

/** Senaryolu sorunun metni ve (varsa) senaryo sorusu; alt soruların üstünde gösterilir. */
export function ScenarioCard({ scenario }: { scenario: ScenarioRef }) {
  const long = scenario.text.length > COLLAPSE_AT;
  const [open, setOpen] = useState(!long);
  return (
    <section className="quiz-scenario" aria-label="Senaryo">
      <div className="card-kicker" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11 }}>
        <BookOpen size={14} strokeWidth={1.5} /> Senaryo
      </div>
      <div className="quiz-scenario-text" data-collapsed={!open || undefined}>{scenario.text}</div>
      {long && (
        <button type="button" className="btn btn-ghost" style={{ padding: "4px 0", fontSize: 14 }} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Daha az göster" : "Devamını göster"}
        </button>
      )}
      {scenario.prompt && <p className="quiz-scenario-prompt">{scenario.prompt}</p>}
    </section>
  );
}

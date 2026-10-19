"use client";

import type { PublicQuestion } from "@/lib/quiz-model";

type Props = {
  question: Extract<PublicQuestion, { kind: "single" | "multiple" }>;
  value: number | number[] | undefined;
  onChange: (v: number | number[]) => void;
  disabled: boolean;
};

/** Tek cevaplı (radyo) ya da çok cevaplı (onay kutusu) soru. Çok cevaplıda en fazla correctCount şık seçilebilir. */
export function ChoiceQuestion({ question: q, value, onChange, disabled }: Props) {
  const multi = q.kind === "multiple";
  const picked = multi ? (Array.isArray(value) ? value : []) : [];
  const full = multi && picked.length >= q.correctCount;

  return (
    <div>
      {multi && (
        <div className="quiz-multi-hint" role="status">
          <span>
            <strong>{q.correctCount} doğru cevabı</strong> seç
          </span>
          <span style={{ color: full ? "var(--color-accent-700)" : "var(--muted-55)" }}>
            {picked.length} / {q.correctCount} seçildi
          </span>
        </div>
      )}
      <div role={multi ? "group" : "radiogroup"} aria-label={q.text} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {q.options.map((o, oi) => {
          const selected = multi ? picked.includes(o.id) : value === o.id;
          const blocked = disabled || (multi && full && !selected);
          return (
            <label
              key={o.id}
              className="blueprint quiz-option"
              data-selected={selected || undefined}
              data-blocked={(!disabled && blocked) || undefined}
              style={{ "--i": oi, display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", cursor: blocked ? "default" : "pointer", background: selected ? "var(--color-accent-100)" : "#fff", borderColor: selected ? "var(--color-accent)" : undefined } as React.CSSProperties}
            >
              <input
                type={multi ? "checkbox" : "radio"}
                name={`q-${q.id}`}
                disabled={blocked}
                checked={selected}
                onChange={() => onChange(multi ? (selected ? picked.filter((id) => id !== o.id) : [...picked, o.id]) : o.id)}
              />
              <span>{o.text}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

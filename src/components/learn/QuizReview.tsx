"use client";

import { useState } from "react";
import { Check, Lightbulb, X } from "lucide-react";

/** Son denemenin cevapları; doğru şık bilgisi yoktur, yalnızca seçilen şıkkın doğru olup olmadığı. */
export type QuizReview = {
  score: number;
  attemptedAt: string; // ISO
  correctCount: number;
  questions: { id: number; text: string; options: { id: number; text: string }[]; selectedOptionId: number | null; isCorrect: boolean; explanation: string | null }[];
};

/** Yanlış cevaplanan sorunun yönetici açıklaması. */
export function QuizExplanation({ text }: { text: string }) {
  return (
    <div className="quiz-explanation" role="note">
      <Lightbulb size={18} strokeWidth={1.5} style={{ flex: "none", marginTop: 2 }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Açıklama</div>
        <div style={{ whiteSpace: "pre-line" }}>{text}</div>
      </div>
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function QuizReviewSection({ review }: { review: QuizReview }) {
  const wrongCount = review.questions.length - review.correctCount;
  const [onlyWrong, setOnlyWrong] = useState(false);
  const shown = onlyWrong ? review.questions.filter((q) => !q.isCorrect) : review.questions;

  return (
    <section id="quiz-review" aria-labelledby="quiz-review-title" className="quiz-review" style={{ marginTop: 40, scrollMarginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 id="quiz-review-title" style={{ fontSize: 28, lineHeight: 1, textTransform: "uppercase", margin: "0 0 6px" }}>Cevapların</h2>
          <div style={{ fontSize: 14, color: "var(--muted-72)" }}>
            Son deneme · {dateFmt.format(new Date(review.attemptedAt))} · %{review.score} · {review.correctCount} doğru, {wrongCount} yanlış
          </div>
        </div>
        {wrongCount > 0 && (
          <div role="group" aria-label="Soruları filtrele" className="quiz-filter">
            <button type="button" aria-pressed={!onlyWrong} onClick={() => setOnlyWrong(false)}>Tümü ({review.questions.length})</button>
            <button type="button" aria-pressed={onlyWrong} onClick={() => setOnlyWrong(true)}>Yanlışlar ({wrongCount})</button>
          </div>
        )}
      </div>

      {wrongCount === 0 && <p style={{ margin: "0 0 20px", color: "var(--color-accent-700)" }}>Tüm soruları doğru cevapladın.</p>}

      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {shown.map((q) => {
          const n = review.questions.indexOf(q) + 1;
          return (
            <li key={q.id} className="quiz-review-item" data-correct={q.isCorrect || undefined} style={{ padding: "18px 20px", background: "#fff" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600, marginBottom: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "var(--color-accent)" }}>{String(n).padStart(2, "0")}</span>
                <span style={{ flex: 1 }}>{q.text}</span>
                <span className="tag" style={{ fontSize: 11, display: "inline-flex", gap: 4, alignItems: "center", color: q.isCorrect ? "var(--color-accent-700)" : "var(--color-accent-2)" }}>
                  {q.isCorrect ? <Check size={14} strokeWidth={2} /> : <X size={14} strokeWidth={2} />}
                  {q.isCorrect ? "Doğru" : q.selectedOptionId === null ? "Cevapsız" : "Yanlış"}
                </span>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {q.options.map((o) => {
                  const picked = o.id === q.selectedOptionId;
                  return (
                    <li key={o.id} className="quiz-review-option" data-picked={picked ? (q.isCorrect ? "correct" : "wrong") : undefined}>
                      {picked ? (q.isCorrect ? <Check size={16} strokeWidth={2} /> : <X size={16} strokeWidth={2} />) : <span style={{ width: 16, flex: "none" }} />}
                      <span>{o.text}</span>
                      {picked && <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>Senin cevabın</span>}
                    </li>
                  );
                })}
              </ul>
              {!q.isCorrect && q.explanation && <QuizExplanation text={q.explanation} />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

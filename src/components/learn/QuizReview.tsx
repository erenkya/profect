"use client";

import { Fragment, useState } from "react";
import { Check, Lightbulb, Minus, X } from "lucide-react";
import type { GradeResult, PublicQuestion } from "@/lib/quiz-model";
import { ScenarioCard } from "./quiz/ScenarioCard";

/** Son denemenin cevapları; doğru şık / kategori bilgisi yoktur, yalnızca öğrencinin cevabının doğru olup olmadığı. */
export type QuizReview = {
  score: number;
  attemptedAt: string; // ISO
  correctCount: number;
  questions: (PublicQuestion & { result: GradeResult })[];
};

/** Tam doğru olmayan sorunun yönetici açıklaması. */
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

/** Soru sonucunun etiketi: Doğru / Kısmen doğru (%) / Yanlış / Cevapsız. */
export function ResultTag({ result }: { result: GradeResult }) {
  const partial = result.points > 0 && result.points < 1;
  const color = result.isCorrect ? "var(--color-accent-700)" : partial ? "var(--color-accent)" : "var(--color-accent-2)";
  const label = result.isCorrect ? "Doğru" : partial ? `Kısmen doğru · %${Math.round(result.points * 100)}` : result.answer === null ? "Cevapsız" : "Yanlış";
  return (
    <span className="tag" style={{ fontSize: 11, display: "inline-flex", gap: 4, alignItems: "center", color, whiteSpace: "nowrap" }}>
      {result.isCorrect ? <Check size={14} strokeWidth={2} /> : partial ? <Minus size={14} strokeWidth={2} /> : <X size={14} strokeWidth={2} />}
      {label}
    </span>
  );
}

const mark = (ok: boolean) => (ok ? <Check size={16} strokeWidth={2} /> : <X size={16} strokeWidth={2} />);

/** Bir sorunun öğrencinin cevabına göre sonucu (şıklar ya da kategoriler) ve açıklaması. */
export function QuestionResultView({ question: q, result }: { question: PublicQuestion; result: GradeResult }) {
  return (
    <>
      {q.kind === "categorize" ? (
        <CategorizeResult question={q} result={result} />
      ) : (
        <>
          {q.kind === "multiple" && <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted-55)" }}>{q.correctCount} doğru cevap vardı.</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {q.options.map((o) => {
              // single: seçilen şık sorunun doğruluğunu taşır; multiple: şık başına sonuç.
              const picked = q.kind === "single" ? (result.answer === o.id ? result.isCorrect : undefined) : result.optionResults?.[String(o.id)];
              return (
                <li key={o.id} className="quiz-review-option" data-picked={picked === undefined ? undefined : picked ? "correct" : "wrong"}>
                  {picked === undefined ? <span style={{ width: 16, flex: "none" }} /> : mark(picked)}
                  <span>{o.text}</span>
                  {picked !== undefined && <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>Senin cevabın</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {result.answer === null && <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--color-accent-2)" }}>Bu soru cevapsız bırakıldı.</p>}
      {result.explanation && <QuizExplanation text={result.explanation} />}
    </>
  );
}

function CategorizeResult({ question: q, result }: { question: Extract<PublicQuestion, { kind: "categorize" }>; result: GradeResult }) {
  const placed = result.answer && typeof result.answer === "object" && !Array.isArray(result.answer) ? result.answer : {};
  const unplaced = q.cards.filter((c) => !(String(c.id) in placed));
  const card = (c: { id: number; text: string }, ok: boolean | undefined) => (
    <li key={c.id} className="quiz-review-option" data-picked={ok === undefined ? undefined : ok ? "correct" : "wrong"}>
      {ok === undefined ? <span style={{ width: 16, flex: "none" }} /> : mark(ok)}
      <span>{c.text}</span>
    </li>
  );
  return (
    <div className="quiz-cat-result">
      {q.categories.map((cat) => (
        <div key={cat.id}>
          <div className="quiz-cat-title">{cat.name}</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {q.cards.filter((c) => placed[String(c.id)] === cat.id).map((c) => card(c, result.cardResults?.[String(c.id)]))}
            {!q.cards.some((c) => placed[String(c.id)] === cat.id) && <li style={{ fontSize: 13, color: "var(--muted-55)" }}>Kart bırakılmadı</li>}
          </ul>
        </div>
      ))}
      {unplaced.length > 0 && (
        <div>
          <div className="quiz-cat-title">Yerleştirilmedi</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>{unplaced.map((c) => card(c, false))}</ul>
        </div>
      )}
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function QuizReviewSection({ review }: { review: QuizReview }) {
  const wrongCount = review.questions.length - review.correctCount;
  const [onlyWrong, setOnlyWrong] = useState(false);
  const shown = onlyWrong ? review.questions.filter((q) => !q.result.isCorrect) : review.questions;

  return (
    <section id="quiz-review" aria-labelledby="quiz-review-title" className="quiz-review" style={{ marginTop: 40, scrollMarginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h2 id="quiz-review-title" style={{ fontSize: 28, lineHeight: 1, textTransform: "uppercase", margin: "0 0 6px" }}>Cevapların</h2>
          <div style={{ fontSize: 14, color: "var(--muted-72)" }}>
            Son deneme · {dateFmt.format(new Date(review.attemptedAt))} · %{review.score} · {review.correctCount} tam doğru, {wrongCount} yanlış ya da eksik
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
        {shown.map((q, i) => {
          const n = review.questions.indexOf(q) + 1;
          // Senaryonun ilk (gösterilen) alt sorusundan önce senaryo metni.
          const newScenario = q.scenario && q.scenario.id !== shown[i - 1]?.scenario?.id;
          return (
            <Fragment key={q.id}>
              {newScenario && q.scenario && (
                <li>
                  <ScenarioCard scenario={q.scenario} />
                </li>
              )}
              <li className="quiz-review-item" data-correct={q.result.isCorrect || undefined} data-in-scenario={q.scenario ? true : undefined} style={{ padding: "18px 20px", background: "#fff" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600, marginBottom: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--color-accent)" }}>{String(n).padStart(2, "0")}</span>
                  <span style={{ flex: 1 }}>{q.text}</span>
                  <ResultTag result={q.result} />
                </div>
                <QuestionResultView question={q} result={q.result} />
              </li>
            </Fragment>
          );
        })}
      </ol>
    </section>
  );
}

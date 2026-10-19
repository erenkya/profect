"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Corners } from "@/components/Corners";
import { CertificateButton } from "./CertificateButton";

type Quiz = {
  id: number;
  title: string;
  course_id: number;
  module_id: number | null;
  passing_score_percentage: number;
  durationMinutes: number | null;
  remainingSeconds: number | null;
  isPassed: boolean;
  bestScore: number | null;
  questions: { id: number; text: string; options: { id: number; text: string }[] }[];
};
type Result = { score: number; isPassed: boolean; correctCount: number; totalQuestions: number; results: Record<string, { isCorrect: boolean; selectedOptionId: number | null }> };

export function QuizPlayer({ quizId, nextHref, certificateCode }: { quizId: number; nextHref: string | null; certificateCode: string | null }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0); // "Tekrar dene" → soruları yeniden karıştırarak yükler
  const [left, setLeft] = useState<number | null>(null); // kalan saniye (süresiz sınavda null)
  const [timedOut, setTimedOut] = useState(false);
  const autoSent = useRef(false);

  useEffect(() => {
    let alive = true;
    setQuiz(null);
    setResult(null);
    setAnswers({});
    setLeft(null);
    setTimedOut(false);
    setError("");
    autoSent.current = false;
    fetch(`/api/client/quizzes/${quizId}`)
      .then(async (r) => ({ ok: r.ok, json: await r.json() }))
      .then(({ ok, json }) => alive && (ok ? setQuiz(json.data) : setError(json.message ?? "Sınav yüklenemedi.")))
      .catch(() => alive && setError("Bağlantı hatası. Lütfen tekrar deneyin."));
    return () => {
      alive = false;
    };
  }, [quizId, round]);

  // Geri sayım: sunucunun verdiği kalan süreden başlar, saat sapmasına karşı bitiş anına göre hesaplanır.
  const remaining = quiz?.remainingSeconds ?? null;
  useEffect(() => {
    if (remaining === null || result) return;
    const deadline = Date.now() + remaining * 1000;
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [remaining, result]);

  // Süre dolunca o ana kadarki cevaplarla otomatik gönder.
  useEffect(() => {
    if (left === 0 && quiz && !result && !busy && !autoSent.current) {
      autoSent.current = true;
      setTimedOut(true);
      void submit();
    }
  });

  async function submit() {
    if (!quiz) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/client/quizzes/${quizId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (res.ok) setResult(json);
      else setError(json.message ?? "Gönderilemedi.");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <div role="alert" style={{ color: "var(--color-accent-2-700)" }}>
        <p>{error}</p>
        <button className="btn btn-primary blueprint" onClick={() => setRound((r) => r + 1)} style={{ marginTop: 12 }}><Corners />Sınavı yeniden başlat</button>
      </div>
    );
  if (!quiz) return <p style={{ color: "var(--muted-55)" }}>Sınav yükleniyor…</p>;
  if (quiz.questions.length === 0) return <p>Bu sınav için henüz soru eklenmemiş.</p>;

  const isFinal = quiz.module_id === null;
  const allAnswered = quiz.questions.every((q) => answers[q.id]);

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="eyebrow">{isFinal ? "Final sınavı" : "Modül sınavı"}</div>
      <h1 style={{ fontSize: "clamp(36px,4.5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 10px" }}>{quiz.title}</h1>
      <p style={{ color: "var(--muted-72)", marginBottom: 28 }}>
        {quiz.questions.length} soru · geçme notu %{quiz.passing_score_percentage}
        {quiz.durationMinutes && <> · süre {quiz.durationMinutes} dk</>}
        {quiz.bestScore !== null && <> · en iyi puanın %{quiz.bestScore}</>}
      </p>

      {!result && left !== null && (
        <div role="timer" aria-live="off" style={{ position: "sticky", top: 12, zIndex: 5, marginBottom: 20, padding: "10px 16px", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${left <= 60 ? "var(--color-accent-2)" : "var(--color-accent)"}`, color: left <= 60 ? "var(--color-accent-2)" : undefined }}>
          <span className="eyebrow">Kalan süre</span>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 700 }}>{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</span>
        </div>
      )}

      {result && timedOut && <p role="status" style={{ marginBottom: 16, color: "var(--muted-72)" }}>Süre doldu; işaretlediğin cevaplar otomatik gönderildi.</p>}

      {result && (
        <div className="card blueprint elev-md" style={{ background: "#fff", padding: 24, gap: 10, marginBottom: 28 }} role="status">
          <Corners />
          <div className="card-kicker" style={{ color: result.isPassed ? "var(--color-accent-700)" : "var(--color-accent-2)" }}>{result.isPassed ? "Geçtin" : "Geçemedin"}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 64, lineHeight: 1, fontWeight: 700, color: "var(--color-accent-2)" }}>%{result.score}</div>
          <div style={{ fontSize: 14, color: "var(--muted-72)" }}>{result.correctCount} / {result.totalQuestions} doğru</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            {!result.isPassed && (
              <button className="btn btn-primary blueprint" onClick={() => setRound((r) => r + 1)}><Corners />Tekrar dene</button>
            )}
            {result.isPassed && isFinal && (certificateCode ? (
              <Link href={`/sertifika/${certificateCode}`} className="btn btn-primary blueprint"><Corners />Sertifikamı Gör</Link>
            ) : (
              <CertificateButton courseId={quiz.course_id} />
            ))}
            {result.isPassed && !isFinal && nextHref && <Link href={nextHref} className="btn btn-primary blueprint" style={{ marginLeft: "auto" }}><Corners />Sonraki →</Link>}
          </div>
        </div>
      )}

      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 28 }}>
        {quiz.questions.map((q, i) => {
          const r = result?.results[q.id];
          return (
            <li key={q.id}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 600, marginBottom: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "var(--color-accent)" }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ flex: 1 }}>{q.text}</span>
                {r && (r.isCorrect ? <Check size={22} strokeWidth={1.5} color="#3a5fdc" /> : <X size={22} strokeWidth={1.5} color="#4a2a9e" />)}
              </div>
              <div role="radiogroup" aria-label={q.text} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {q.options.map((o) => {
                  const selected = (r?.selectedOptionId ?? answers[q.id]) === o.id;
                  return (
                    <label key={o.id} className="blueprint" style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", cursor: result ? "default" : "pointer", background: selected ? "var(--color-accent-100)" : "#fff", borderColor: selected ? "var(--color-accent)" : undefined }}>
                      <input type="radio" name={`q-${q.id}`} disabled={!!result} checked={selected} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))} />
                      <span>{o.text}</span>
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      {!result && (
        <button className="btn btn-primary blueprint" disabled={!allAnswered || busy} onClick={submit} style={{ marginTop: 32, fontSize: 17, padding: "12px 28px" }}>
          <Corners />
          {busy ? "Gönderiliyor…" : "Sınavı Bitir"}
        </button>
      )}
    </div>
  );
}

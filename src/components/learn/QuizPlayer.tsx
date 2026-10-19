"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Clock, ListChecks, Target, Trophy, X } from "lucide-react";
import { Corners } from "@/components/Corners";
import { CertificateButton } from "./CertificateButton";
import { QuizReviewSection, type QuizReview } from "./QuizReview";

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

/** Başlangıç ekranı bilgileri sunucudan gelir; sınav API'si çağrılınca süre başladığı için o ana kadar çağrılmaz. */
export type QuizIntro = {
  title: string;
  courseId: number;
  isFinal: boolean;
  questionCount: number;
  passingScore: number;
  durationMinutes: number | null;
  bestScore: number | null;
  resumeSeconds: number | null; // açık süreli oturum varsa kalan saniye
  passed: boolean; // daha önce geçilmiş mi
  review: QuizReview | null; // geçilmiş sınavda son denemenin cevapları
};

const AUTO_ADVANCE_MS = 350;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function QuizPlayer({ quizId, intro, nextHref, certificateCode }: { quizId: number; intro: QuizIntro; nextHref: string | null; certificateCode: string | null }) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0); // "Tekrar dene" → soruları yeniden karıştırarak yükler
  const [left, setLeft] = useState<number | null>(null); // kalan saniye (süresiz sınavda null)
  const [timedOut, setTimedOut] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const autoSent = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!started) return;
    let alive = true;
    setQuiz(null);
    setResult(null);
    setAnswers({});
    setLeft(null);
    setTimedOut(false);
    setError("");
    setCurrent(0);
    setDir("next");
    autoSent.current = false;
    fetch(`/api/client/quizzes/${quizId}`)
      .then(async (r) => ({ ok: r.ok, json: await r.json() }))
      .then(({ ok, json }) => alive && (ok ? setQuiz(json.data) : setError(json.message ?? "Sınav yüklenemedi.")))
      .catch(() => alive && setError("Bağlantı hatası. Lütfen tekrar deneyin."));
    return () => {
      alive = false;
    };
  }, [quizId, round, started]);

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

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
      if (res.ok) {
        setResult(json);
        setDir("prev");
        setCurrent(0); // sonuçtan sonra cevaplar baştan gözden geçirilir
        // Kenar çubuğu (geçildi işareti, ilerleme) sunucu layout'unda; yeniden çek.
        if (json.isPassed) router.refresh();
      } else setError(json.message ?? "Gönderilemedi.");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  function goTo(i: number) {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setDir(i >= current ? "next" : "prev");
    setCurrent(i);
  }

  function choose(questionId: number, optionId: number, index: number, total: number) {
    const firstAnswer = !answers[questionId];
    setAnswers((a) => ({ ...a, [questionId]: optionId }));
    // İlk kez cevaplanan soruda kısa bir beklemeden sonra sıradakine geç (cevap değiştirirken geçme).
    if (firstAnswer && index < total - 1) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => goTo(index + 1), AUTO_ADVANCE_MS);
    }
  }

  const header = (
    <div className="lesson-head">
      <div className="eyebrow">{intro.isFinal ? "Final sınavı" : "Modül sınavı"}</div>
      <h1 className="lesson-title" style={{ fontSize: "clamp(36px,4.5vw,56px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 28px" }}>{intro.title}</h1>
    </div>
  );

  // — Geçilmiş sınav: skor ve "Tekrar çöz" (yarım kalan bir tekrar varsa normal başlangıç ekranı gösterilir) —
  if (!started && intro.passed && intro.resumeSeconds === null) {
    return (
      <div style={{ maxWidth: 760 }}>
        {header}
        <section className="card blueprint elev-md quiz-intro" aria-labelledby="quiz-passed-title" style={{ background: "#fff", padding: "clamp(20px,3vw,32px)", gap: 12 }}>
          <Corners />
          <div className="card-kicker" id="quiz-passed-title" style={{ color: "var(--color-accent-700)", display: "inline-flex", gap: 6, alignItems: "center" }}>
            <Check className="side-check" size={16} strokeWidth={2} /> Bu sınavı geçtin
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 72, lineHeight: 1, fontWeight: 700, color: "var(--color-accent-2)" }}>%{intro.bestScore ?? 0}</div>
            <div style={{ fontSize: 14, color: "var(--muted-72)" }}>en iyi puanın · geçme notu %{intro.passingScore}</div>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted-72)" }}>
            İstersen tekrar çözebilirsin; geçme durumun ve en iyi puanın korunur.
            {intro.durationMinutes !== null && <> Tekrar çözerken süre ({intro.durationMinutes} dk) yeniden işler.</>}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            {intro.isFinal && (certificateCode ? (
              <Link href={`/sertifika/${certificateCode}`} className="btn btn-primary blueprint"><Corners />Sertifikamı Gör</Link>
            ) : (
              <CertificateButton courseId={intro.courseId} />
            ))}
            {!intro.isFinal && nextHref && (
              <Link href={nextHref} className="btn btn-primary blueprint lesson-next"><Corners />Sonraki <span className="lesson-arrow" aria-hidden>→</span></Link>
            )}
            {intro.questionCount > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => setStarted(true)}>Tekrar çöz</button>
            )}
          </div>
        </section>
        {intro.review ? (
          <QuizReviewSection review={intro.review} />
        ) : (
          <p style={{ marginTop: 32, fontSize: 14, color: "var(--muted-55)" }}>Bu deneme için cevapların kaydedilmemiş; sınavı tekrar çözersen cevaplarını burada inceleyebilirsin.</p>
        )}
      </div>
    );
  }

  // — Başlangıç ekranı —
  if (!started) {
    const stats = [
      { icon: ListChecks, label: "Soru", value: String(intro.questionCount) },
      { icon: Clock, label: "Süre", value: intro.durationMinutes ? `${intro.durationMinutes} dk` : "Süresiz" },
      { icon: Target, label: "Geçme notu", value: `%${intro.passingScore}` },
      ...(intro.bestScore !== null ? [{ icon: Trophy, label: "En iyi puanın", value: `%${intro.bestScore}` }] : []),
    ];
    return (
      <div style={{ maxWidth: 760 }}>
        {header}
        <section className="card blueprint quiz-intro" aria-labelledby="quiz-intro-title" style={{ background: "#fff", padding: "clamp(20px,3vw,32px)", gap: 24 }}>
          <Corners />
          <div>
            <div className="card-kicker" id="quiz-intro-title">{intro.resumeSeconds !== null ? "Yarım kalan sınav" : "Sınava başla"}</div>
            <p style={{ margin: "8px 0 0", color: "var(--muted-72)" }}>
              Sorular tek tek gösterilir; aralarında ileri geri gidebilir, cevaplarını bitirmeden önce değiştirebilirsin.
            </p>
          </div>
          <div className="quiz-stats">
            {stats.map((s, i) => (
              <div key={s.label} className="quiz-stat" style={{ "--i": i } as React.CSSProperties}>
                <s.icon size={18} strokeWidth={1.5} style={{ color: "var(--color-accent)" }} />
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 13, color: "var(--muted-55)" }}>{s.label}</div>
              </div>
            ))}
          </div>
          {intro.durationMinutes !== null && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--muted-72)", display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Süre, &quot;{intro.resumeSeconds !== null ? "Sınava devam et" : "Sınava başla"}&quot; butonuna bastığın anda işlemeye başlar.</li>
              <li>Sayfayı yenilemek ya da kapatmak süreyi durdurmaz.</li>
              <li>Süre dolduğunda o ana kadar işaretlediğin cevaplar otomatik gönderilir.</li>
            </ul>
          )}
          {intro.resumeSeconds !== null && (
            <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--color-accent-2)" }}>
              Bu sınavı daha önce başlattın; kalan süren yaklaşık {mmss(intro.resumeSeconds)}.
            </p>
          )}
          {intro.questionCount === 0 ? (
            <p style={{ margin: 0 }}>Bu sınav için henüz soru eklenmemiş.</p>
          ) : (
            <div>
              <button className="btn btn-primary blueprint lesson-next" onClick={() => setStarted(true)} style={{ fontSize: 17, padding: "12px 28px" }}>
                <Corners />
                {intro.resumeSeconds !== null ? "Sınava devam et" : "Sınava başla"} <span className="lesson-arrow" aria-hidden>→</span>
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (error)
    return (
      <div style={{ maxWidth: 760 }}>
        {header}
        <div role="alert" style={{ color: "var(--color-accent-2-700)" }}>
          <p>{error}</p>
          <button className="btn btn-primary blueprint" onClick={() => setRound((r) => r + 1)} style={{ marginTop: 12 }}><Corners />Sınavı yeniden başlat</button>
        </div>
      </div>
    );
  if (!quiz)
    return (
      <div style={{ maxWidth: 760 }}>
        {header}
        <p style={{ color: "var(--muted-55)" }}>Sınav yükleniyor…</p>
      </div>
    );
  if (quiz.questions.length === 0)
    return (
      <div style={{ maxWidth: 760 }}>
        {header}
        <p>Bu sınav için henüz soru eklenmemiş.</p>
      </div>
    );

  const total = quiz.questions.length;
  const isFinal = quiz.module_id === null;
  const answeredCount = quiz.questions.filter((q) => answers[q.id]).length;
  const allAnswered = answeredCount === total;
  const q = quiz.questions[Math.min(current, total - 1)];
  const r = result?.results[q.id];
  const isLast = current === total - 1;

  return (
    <div style={{ maxWidth: 760 }}>
      {header}

      {!result && left !== null && (
        <div role="timer" aria-live="off" className={left <= 60 ? "quiz-timer quiz-timer-low" : "quiz-timer"} style={{ position: "sticky", top: 12, zIndex: 5, marginBottom: 20, padding: "10px 16px", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${left <= 60 ? "var(--color-accent-2)" : "var(--color-accent)"}`, color: left <= 60 ? "var(--color-accent-2)" : undefined }}>
          <span className="eyebrow">Kalan süre</span>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 700 }}>{mmss(left)}</span>
        </div>
      )}

      {result && timedOut && <p role="status" style={{ marginBottom: 16, color: "var(--muted-72)" }}>Süre doldu; işaretlediğin cevaplar otomatik gönderildi.</p>}

      {result && (
        <div className="card blueprint elev-md quiz-result" style={{ background: "#fff", padding: 24, gap: 10, marginBottom: 28 }} role="status">
          <Corners />
          <div className="card-kicker" style={{ color: result.isPassed ? "var(--color-accent-700)" : "var(--color-accent-2)" }}>{result.isPassed ? "Geçtin" : "Geçemedin"}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 64, lineHeight: 1, fontWeight: 700, color: "var(--color-accent-2)" }}>%{result.score}</div>
          <div style={{ fontSize: 14, color: "var(--muted-72)" }}>{result.correctCount} / {result.totalQuestions} doğru · cevaplarını aşağıdan soru soru inceleyebilirsin</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            {!result.isPassed && (
              <button className="btn btn-primary blueprint" onClick={() => setRound((n) => n + 1)}><Corners />Tekrar dene</button>
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

      {/* İlerleme: soru numaraları; tıklayınca o soruya gider. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <span className="eyebrow" style={{ margin: 0 }}>Soru {current + 1} / {total}</span>
        {!result && <span style={{ fontSize: 13, color: "var(--muted-55)" }}>{answeredCount} / {total} cevaplandı</span>}
      </div>
      <div className="progress-track" aria-hidden style={{ marginBottom: 14 }}>
        <div className="progress-fill" style={{ width: `${((result ? total : answeredCount) / total) * 100}%` }} />
      </div>
      <nav aria-label="Sorular" className="quiz-dots">
        {quiz.questions.map((item, i) => {
          const res = result?.results[item.id];
          const state = res ? (res.isCorrect ? "correct" : "wrong") : answers[item.id] ? "answered" : "empty";
          return (
            <button
              key={item.id}
              type="button"
              className="quiz-dot"
              data-state={state}
              aria-current={i === current ? "step" : undefined}
              aria-label={`Soru ${i + 1}${state === "correct" ? ", doğru" : state === "wrong" ? ", yanlış" : state === "answered" ? ", cevaplandı" : ", cevaplanmadı"}`}
              onClick={() => goTo(i)}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      <div key={q.id} className="quiz-question" data-dir={dir} style={{ marginTop: 24 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 600, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "var(--color-accent)" }}>{String(current + 1).padStart(2, "0")}</span>
          <span style={{ flex: 1 }}>{q.text}</span>
          {r && (r.isCorrect ? <Check className="side-check" size={24} strokeWidth={1.5} color="#3a5fdc" /> : <X className="side-check" size={24} strokeWidth={1.5} color="#4a2a9e" />)}
        </div>
        <div role="radiogroup" aria-label={q.text} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((o, oi) => {
            const selected = (r?.selectedOptionId ?? answers[q.id]) === o.id;
            return (
              <label key={o.id} className="blueprint quiz-option" data-selected={selected || undefined} style={{ "--i": oi, display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", cursor: result ? "default" : "pointer", background: selected ? "var(--color-accent-100)" : "#fff", borderColor: selected ? "var(--color-accent)" : undefined } as React.CSSProperties}>
                <input type="radio" name={`q-${q.id}`} disabled={!!result} checked={selected} onChange={() => choose(q.id, o.id, current, total)} />
                <span>{o.text}</span>
              </label>
            );
          })}
        </div>
        {r && !r.selectedOptionId && <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--color-accent-2)" }}>Bu soru cevapsız bırakıldı.</p>}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 32 }}>
        <button type="button" className="btn btn-secondary" disabled={current === 0} onClick={() => goTo(current - 1)}>← Önceki</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!result && isLast && !allAnswered && <span style={{ fontSize: 13, color: "var(--muted-55)" }}>{total - answeredCount} soru cevapsız</span>}
          {!isLast && (
            <button type="button" className={`btn ${answers[q.id] || result ? "btn-primary" : "btn-secondary"} lesson-next`} onClick={() => goTo(current + 1)}>
              Sonraki <span className="lesson-arrow" aria-hidden>→</span>
            </button>
          )}
          {!result && (isLast || allAnswered) && (
            <button className="btn btn-primary blueprint" disabled={!allAnswered || busy} onClick={submit} style={{ fontSize: 17, padding: "12px 28px" }}>
              <Corners />
              {busy ? "Gönderiliyor…" : "Sınavı Bitir"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, Clock, ListChecks, Target, Trophy } from "lucide-react";
import { Corners } from "@/components/Corners";
import { CertificateButton } from "./CertificateButton";
import { QuestionResultView, QuizReviewSection, ResultTag, type QuizReview } from "./QuizReview";
import { ChoiceQuestion } from "./quiz/ChoiceQuestion";
import { CategorizeQuestion } from "./quiz/CategorizeQuestion";
import { ScenarioCard } from "./quiz/ScenarioCard";
import { isAnswered, type Answer, type GradeResult, type PublicQuestion } from "@/lib/quiz-model";

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
  questions: PublicQuestion[];
  draftAnswers: Record<string, Answer>; // kaldığı yerden devam: oturumda kayıtlı cevaplar
};
type Result = { score: number; isPassed: boolean; correctCount: number; points: number; totalQuestions: number; results: Record<string, GradeResult> };

/** Başlangıç ekranı bilgileri sunucudan gelir; sınav API'si çağrılınca süre başladığı için o ana kadar çağrılmaz. */
export type QuizIntro = {
  title: string;
  courseId: number;
  isFinal: boolean;
  questionCount: number;
  passingScore: number;
  durationMinutes: number | null;
  bestScore: number | null;
  resume: { seconds: number | null; answered: number } | null; // yarım kalan deneme: kalan süre (süreliyse), kayıtlı cevap sayısı
  passed: boolean; // daha önce geçilmiş mi
  review: QuizReview | null; // geçilmiş sınavda son denemenin cevapları
};

const AUTO_ADVANCE_MS = 350;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function QuizPlayer({ quizId, intro, nextHref, certificateCode }: { quizId: number; intro: QuizIntro; nextHref: string | null; certificateCode: string | null }) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0); // "Tekrar dene" → soruları yeniden karıştırarak yükler
  const [left, setLeft] = useState<number | null>(null); // kalan saniye (süresiz sınavda null)
  const [timedOut, setTimedOut] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const autoSent = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers); // otomatik geçişteki gecikmeli goTo da en güncel cevapları kaydetsin
  answersRef.current = answers;
  const savedJson = useRef("{}");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

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
    setSaveState("idle");
    autoSent.current = false;
    fetch(`/api/client/quizzes/${quizId}`)
      .then(async (r) => ({ ok: r.ok, json: await r.json() }))
      .then(({ ok, json }) => {
        if (!alive) return;
        if (!ok) return setError(json.message ?? "Sınav yüklenemedi.");
        const data: Quiz = json.data;
        // Kaydedilmiş cevaplarla ilk cevapsız sorudan devam.
        const draft = Object.fromEntries(Object.entries(data.draftAnswers ?? {}).map(([k, v]) => [Number(k), v]));
        savedJson.current = JSON.stringify(data.draftAnswers ?? {});
        setAnswers(draft);
        const firstOpen = data.questions.findIndex((q) => !isAnswered(q, draft[q.id]));
        setCurrent(firstOpen === -1 ? Math.max(0, data.questions.length - 1) : firstOpen);
        setQuiz(data);
      })
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

  /** İlerlemeyi oturuma kaydeder (değişiklik varsa). Başarısızlık sınavı durdurmaz; gönderimde cevaplar zaten gider. */
  async function saveProgress() {
    const json = JSON.stringify(answersRef.current);
    if (json === savedJson.current || result) return;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/client/quizzes/${quizId}/progress`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: answersRef.current }) });
      if (!res.ok) throw new Error();
      savedJson.current = json;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function goTo(i: number) {
    void saveProgress(); // her soru geçişinde kaydet
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setDir(i >= current ? "next" : "prev");
    setCurrent(i);
  }

  function answer(q: PublicQuestion, value: Answer, index: number, total: number) {
    const firstAnswer = answers[q.id] === undefined;
    setAnswers((a) => ({ ...a, [q.id]: value }));
    // Tek cevaplıda ilk kez cevaplanınca kısa bir beklemeden sonra sıradakine geç (cevap değiştirirken geçme).
    if (q.kind === "single" && firstAnswer && index < total - 1) {
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
  if (!started && intro.passed && intro.resume === null) {
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
            {intro.review && (
              <button
                type="button"
                className="btn btn-secondary"
                aria-expanded={showReview}
                aria-controls="quiz-review"
                onClick={() => {
                  setShowReview((v) => !v);
                  if (!showReview) requestAnimationFrame(() => document.getElementById("quiz-review")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                }}
              >
                {showReview ? "Cevapları gizle" : "Cevaplarımı gör"}
              </button>
            )}
            {intro.questionCount > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => setStarted(true)}>Tekrar çöz</button>
            )}
          </div>
          {!intro.review && (
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--color-accent-2)" }}>
              Bu sınavı cevaplar kaydedilmeye başlamadan önce çözdüğün için ayrıntılı sonucun yok. Tekrar çözersen hangi soruda ne yaptığını burada görebilirsin.
            </p>
          )}
        </section>
        {intro.review && showReview && <QuizReviewSection review={intro.review} />}
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
            <div className="card-kicker" id="quiz-intro-title">{intro.resume ? "Yarım kalan sınav" : "Sınava başla"}</div>
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
              <li>Süre, &quot;{intro.resume ? "Sınava devam et" : "Sınava başla"}&quot; butonuna bastığın anda işlemeye başlar.</li>
              <li>Sayfayı yenilemek ya da kapatmak süreyi durdurmaz.</li>
              <li>Süre dolduğunda o ana kadar işaretlediğin cevaplar otomatik gönderilir.</li>
            </ul>
          )}
          {intro.resume && (
            <p role="status" style={{ margin: 0, fontSize: 14, color: "var(--color-accent-2)" }}>
              Bu sınavı daha önce başlattın
              {intro.resume.answered > 0 && <>; {intro.resume.answered} cevabın kayıtlı</>}
              {intro.resume.seconds !== null && <>; kalan süren yaklaşık {mmss(intro.resume.seconds)}</>}. Kaldığın yerden devam edeceksin.
            </p>
          )}
          {intro.questionCount === 0 ? (
            <p style={{ margin: 0 }}>Bu sınav için henüz soru eklenmemiş.</p>
          ) : (
            <div>
              <button className="btn btn-primary blueprint lesson-next" onClick={() => setStarted(true)} style={{ fontSize: 17, padding: "12px 28px" }}>
                <Corners />
                {intro.resume ? "Sınava devam et" : "Sınava başla"} <span className="lesson-arrow" aria-hidden>→</span>
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
  const answeredCount = quiz.questions.filter((q) => isAnswered(q, answers[q.id])).length;
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
          <div style={{ fontSize: 14, color: "var(--muted-72)" }}>{result.correctCount} / {result.totalQuestions} tam doğru · cevaplarını aşağıdan soru soru inceleyebilirsin</div>
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
        {!result && (
          <span style={{ fontSize: 13, color: "var(--muted-55)" }}>
            {answeredCount} / {total} cevaplandı
            {saveState !== "idle" && (
              <span role="status" style={{ marginLeft: 8, color: saveState === "error" ? "var(--color-accent-2)" : undefined }}>
                · {saveState === "saving" ? "Kaydediliyor…" : saveState === "saved" ? "Kaydedildi" : "Kaydedilemedi"}
              </span>
            )}
          </span>
        )}
      </div>
      <div className="progress-track" aria-hidden style={{ marginBottom: 14 }}>
        <div className="progress-fill" style={{ width: `${((result ? total : answeredCount) / total) * 100}%` }} />
      </div>
      <nav aria-label="Sorular" className="quiz-dots">
        {quiz.questions.map((item, i) => {
          const res = result?.results[item.id];
          const state = res ? (res.isCorrect ? "correct" : res.points > 0 ? "partial" : "wrong") : isAnswered(item, answers[item.id]) ? "answered" : "empty";
          return (
            <button
              key={item.id}
              type="button"
              className="quiz-dot"
              data-state={state}
              aria-current={i === current ? "step" : undefined}
              aria-label={`Soru ${i + 1}${state === "correct" ? ", doğru" : state === "wrong" ? ", yanlış" : state === "partial" ? ", kısmen doğru" : state === "answered" ? ", cevaplandı" : ", cevaplanmadı"}`}
              onClick={() => goTo(i)}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      <div key={q.id} className="quiz-question" data-dir={dir} style={{ marginTop: 24 }}>
        {q.scenario && <ScenarioCard scenario={q.scenario} />}
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 26, fontWeight: 600, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ color: "var(--color-accent)" }}>{String(current + 1).padStart(2, "0")}</span>
          <span style={{ flex: 1 }}>{q.text}</span>
          {r && <ResultTag result={r} />}
        </div>
        {r ? (
          <QuestionResultView question={q} result={r} />
        ) : q.kind === "categorize" ? (
          <CategorizeQuestion question={q} value={answers[q.id] as Record<string, number> | undefined} onChange={(v) => answer(q, v, current, total)} disabled={busy || !!result} />
        ) : (
          <ChoiceQuestion question={q} value={answers[q.id] as number | number[] | undefined} onChange={(v) => answer(q, v, current, total)} disabled={busy || !!result} />
        )}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 32 }}>
        <button type="button" className="btn btn-secondary" disabled={current === 0} onClick={() => goTo(current - 1)}>← Önceki</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {!result && isLast && !allAnswered && <span style={{ fontSize: 13, color: "var(--muted-55)" }}>{total - answeredCount} soru cevapsız</span>}
          {!isLast && (
            <button type="button" className={`btn ${isAnswered(q, answers[q.id]) || result ? "btn-primary" : "btn-secondary"} lesson-next`} onClick={() => goTo(current + 1)}>
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

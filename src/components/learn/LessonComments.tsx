"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CommentNode } from "@/lib/comments";

type Thread = { question: CommentNode; replies: CommentNode[] };

const when = (iso: string) => new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });

/** Soru ya da cevap yazma kutusu. Başarılı gönderimden sonra sunucu verisini tazeler. */
export function CommentForm({ lessonId, parentId = null, placeholder, submitLabel, compact = false }: { lessonId: number; parentId?: number | null; placeholder: string; submitLabel: string; compact?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/client/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId, parent_id: parentId, body: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message ?? "Gönderilemedi.");
      } else {
        setText("");
        router.refresh();
      }
    } catch {
      setError("Bağlantı hatası.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        className="input"
        required
        rows={compact ? 2 : 3}
        maxLength={2000}
        placeholder={placeholder}
        aria-label={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ background: "#fff", resize: "vertical" }}
      />
      {error && <div role="alert" style={{ color: "var(--color-danger, #b3261e)", fontSize: 14 }}>{error}</div>}
      <div><button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? "Gönderiliyor…" : submitLabel}</button></div>
    </form>
  );
}

function Message({ c }: { c: CommentNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 13, color: "var(--muted-55)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{c.author}</strong>
        {c.isStaff && <span className="tag tag-accent-2">Eğitmen</span>}
        <span>{when(c.created_at)}</span>
      </div>
      <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.body}</p>
    </div>
  );
}

/** Ders sayfasının altındaki soru & yorum bölümü. `canPost` false ise (önizleme) yalnızca okunur. */
export function LessonComments({ lessonId, threads, canPost }: { lessonId: number; threads: Thread[]; canPost: boolean }) {
  const [replying, setReplying] = useState<number | null>(null);
  return (
    <section aria-labelledby="comments-title" style={{ marginTop: 48, maxWidth: 760 }}>
      <h2 id="comments-title" style={{ fontSize: 28, textTransform: "uppercase", margin: "0 0 16px" }}>Sorular ve yorumlar</h2>

      {canPost ? (
        <CommentForm lessonId={lessonId} placeholder="Bu dersle ilgili sorunu yaz — eğitmene e-postayla iletilir." submitLabel="Soruyu gönder" />
      ) : (
        <p style={{ margin: 0, color: "var(--muted-55)" }}>Soru sormak için kursa kayıt olmalısın.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 28 }}>
        {threads.length === 0 && <p style={{ margin: 0, color: "var(--muted-55)" }}>Henüz soru yok. İlk soruyu sen sor.</p>}
        {threads.map(({ question, replies }) => (
          <article key={question.id} className="card" style={{ background: "#fff", padding: 20, gap: 14 }}>
            <Message c={question} />
            {replies.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingLeft: 16, borderLeft: "2px solid var(--color-accent-100)" }}>
                {replies.map((r) => <Message key={r.id} c={r} />)}
              </div>
            )}
            {canPost && (replying === question.id ? (
              <CommentForm lessonId={lessonId} parentId={question.id} placeholder="Yanıtını yaz" submitLabel="Yanıtla" compact />
            ) : (
              <div><button type="button" className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setReplying(question.id)}>Yanıtla</button></div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

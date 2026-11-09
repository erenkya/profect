import Link from "next/link";
import { CommentForm, DeleteCommentButton } from "@/components/learn/LessonComments";
import { requireStaffPage } from "@/lib/admin-guard";
import { listStaffThreads } from "@/lib/comments";

export const metadata = { title: "Öğrenci soruları" };

const when = (iso: string) => new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });

export default async function StaffQuestions({ searchParams }: { searchParams: Promise<{ soru?: string }> }) {
  const user = await requireStaffPage();
  const focus = Number((await searchParams).soru) || null;
  const threads = await listStaffThreads(user);
  const waiting = threads.filter((t) => !t.answered).length;

  return (
    <div>
      <h1 style={{ fontSize: "clamp(32px,4vw,48px)", textTransform: "uppercase", margin: "0 0 8px" }}>Öğrenci soruları</h1>
      <p style={{ margin: "0 0 28px", color: "var(--muted-55)" }}>
        {threads.length === 0 ? "Henüz soru yok." : `${waiting} soru cevap bekliyor · toplam ${threads.length}`}
        {user.role === "admin" && " · Yönetici olarak tüm derslerin sorularını görüyorsun."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 820 }}>
        {threads.map((t) => (
          <article
            key={t.question.id}
            id={`soru-${t.question.id}`}
            className="card"
            style={{ background: "#fff", padding: 20, gap: 14, outline: focus === t.question.id ? "2px solid var(--color-accent-500, #3a5fdc)" : undefined }}
          >
            <div style={{ fontSize: 13, color: "var(--muted-55)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className={`tag ${t.answered ? "tag-neutral" : "tag-accent-2"}`}>{t.answered ? "Cevaplandı" : "Cevap bekliyor"}</span>
              <Link href={`/ogrenim/${t.courseSlug}/ders/${t.lessonId}`}>{t.courseTitle} · {t.lessonTitle}</Link>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "var(--muted-55)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{t.question.author}</strong> · {when(t.question.created_at)}<DeleteCommentButton commentId={t.question.id} /></div>
              <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{t.question.body}</p>
            </div>
            {t.replies.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 16, borderLeft: "2px solid var(--color-accent-100)" }}>
                {t.replies.map((r) => (
                  <div key={r.id}>
                    <div style={{ fontSize: 13, color: "var(--muted-55)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong style={{ color: "var(--color-text)", fontWeight: 600 }}>{r.author}</strong>{r.isStaff && " (eğitmen)"} · {when(r.created_at)}<DeleteCommentButton commentId={r.id} /></div>
                    <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.body}</p>
                  </div>
                ))}
              </div>
            )}
            <CommentForm lessonId={t.lessonId} parentId={t.question.id} placeholder="Cevabını yaz — öğrenciler dersin altında görür" submitLabel="Cevapla" compact />
          </article>
        ))}
      </div>
    </div>
  );
}

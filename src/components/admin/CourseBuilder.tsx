"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, CirclePlay, FileText, Pencil, Trash2 } from "lucide-react";
import { Corners } from "@/components/Corners";
import { FormMessage } from "@/components/auth/AuthShell";
import type { AdminLesson, AdminModule, AdminQuizRef, CourseRow } from "@/lib/lms";
import { adminApi } from "./api";
import { VideoUploadField } from "./VideoUploadField";
import { CoverUploadField } from "./CoverUploadField";

type Props = { course: CourseRow; modules: AdminModule[]; finalQuiz: AdminQuizRef | null };
type Flash = { kind: "ok" | "error"; text: string } | null;

const input = { background: "#fff", fontSize: 15, minHeight: 38 } as const;
const iconBtn = { width: 32, height: 32 } as const;

export function CourseBuilder({ course, modules, finalQuiz }: Props) {
  const router = useRouter();
  const [flash, setFlash] = useState<Flash>(null);

  // Her başarılı işlemden sonra sunucu verisini tazele.
  async function run(promise: ReturnType<typeof adminApi>, okText?: string) {
    const r = await promise;
    setFlash({ kind: r.ok ? "ok" : "error", text: r.ok ? (okText ?? r.message) : r.message });
    if (r.ok) router.refresh();
    return r;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
      {flash && <FormMessage kind={flash.kind}>{flash.text}</FormMessage>}
      <CourseForm course={course} run={run} onDeleted={() => router.push("/admin/kurslar")} />

      <section>
        <h2 style={{ fontSize: 36, textTransform: "uppercase", marginBottom: 16 }}>Müfredat</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {modules.map((m, i) => (
            <ModuleCard key={m.id} mod={m} index={i} courseId={course.id} siblings={modules} run={run} />
          ))}
        </div>
        <AddModule courseId={course.id} run={run} />
      </section>

      <section>
        <h2 style={{ fontSize: 36, textTransform: "uppercase", marginBottom: 12 }}>Final sınavı</h2>
        <QuizRow quiz={finalQuiz} createUrl="/api/admin/quizzes" createBody={{ course_id: course.id, title: `${course.title} — Final sınavı` }} run={run} />
        <p style={{ fontSize: 13, color: "var(--muted-55)" }}>Sertifika, final sınavı geçilince verilir. Final sınavı yoksa kurs sertifika veremez.</p>
      </section>
    </div>
  );
}

type Run = (p: ReturnType<typeof adminApi>, okText?: string) => Promise<{ ok: boolean }>;

function CourseForm({ course, run, onDeleted }: { course: CourseRow; run: Run; onDeleted: () => void }) {
  const [f, setF] = useState({
    title: course.title, slug: course.slug, code: course.code, category: course.category, level: course.level, instructor: course.instructor,
    hours: String(course.hours), rating: course.rating ?? "", price: String(course.price), old_price: course.old_price == null ? "" : String(course.old_price),
    description: course.description, outcomes: course.outcomes.join("\n"), is_published: course.is_published,
  });
  const [thumbnail, setThumbnail] = useState<string | null>(course.thumbnail_url);
  const [coverBusy, setCoverBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function save(e: React.FormEvent, published = f.is_published) {
    e.preventDefault();
    if (e.currentTarget instanceof HTMLButtonElement && !e.currentTarget.form?.reportValidity()) return;
    if (published !== f.is_published) setF({ ...f, is_published: published });
    run(
      adminApi("PATCH", `/api/admin/courses/${course.id}`, {
        title: f.title, slug: f.slug, code: f.code, category: f.category, level: f.level, instructor: f.instructor,
        hours: Number(f.hours) || 0, rating: f.rating === "" ? null : Number(f.rating), price: Number(f.price) || 0,
        old_price: f.old_price === "" ? null : Number(f.old_price), description: f.description,
        outcomes: f.outcomes.split("\n").map((s) => s.trim()).filter(Boolean), is_published: published,
        thumbnail_url: thumbnail,
      }),
      published === course.is_published ? "Kurs kaydedildi." : published ? "Kurs yayınlandı." : "Kurs yayından kaldırıldı.",
    );
  }

  return (
    <form onSubmit={save} className="card blueprint" style={{ background: "#fff", padding: 24, gap: 16 }}>
      <Corners />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 40, textTransform: "uppercase", margin: 0 }}>{course.title}</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`tag ${f.is_published ? "tag-accent" : "tag-neutral"}`}>{f.is_published ? "Yayında" : "Taslak"}</span>
          {f.is_published ? (
            <button type="button" className="btn btn-secondary" disabled={coverBusy} onClick={(e) => save(e, false)}>Yayından kaldır</button>
          ) : (
            <button
              type="button"
              className="btn btn-primary blueprint"
              disabled={coverBusy}
              onClick={(e) => save(e, true)}
              style={{ fontSize: 18, padding: "14px 28px", background: "var(--color-accent-2)", borderColor: "var(--color-accent-2)", boxShadow: "0 6px 18px color-mix(in srgb, var(--color-accent-2) 35%, transparent)" }}
            >
              <Corners />Yayınla
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        <div className="field"><label>Başlık</label><input className="input" required value={f.title} onChange={set("title")} style={input} /></div>
        <div className="field"><label>Slug (URL)</label><input className="input" required pattern="[a-z0-9-]+" value={f.slug} onChange={set("slug")} style={input} /></div>
        <div className="field"><label>Kod</label><input className="input" required value={f.code} onChange={set("code")} style={input} /></div>
        <div className="field"><label>Kategori</label><input className="input" value={f.category} onChange={set("category")} style={input} /></div>
        <div className="field"><label>Seviye</label><input className="input" value={f.level} onChange={set("level")} style={input} /></div>
        <div className="field"><label>Eğitmen</label><input className="input" value={f.instructor} onChange={set("instructor")} style={input} /></div>
        <div className="field"><label>Süre (saat)</label><input className="input" type="number" min={0} value={f.hours} onChange={set("hours")} style={input} /></div>
        <div className="field"><label>Puan (0–9.9)</label><input className="input" type="number" step="0.1" min={0} max={9.9} value={f.rating} onChange={set("rating")} style={input} /></div>
        <div className="field"><label>Fiyat (₺)</label><input className="input" type="number" min={0} value={f.price} onChange={set("price")} style={input} /></div>
        <div className="field"><label>Eski fiyat (₺)</label><input className="input" type="number" min={0} value={f.old_price} onChange={set("old_price")} style={input} /></div>
      </div>
      <CoverUploadField courseId={course.id} value={thumbnail} onChange={setThumbnail} onBusyChange={setCoverBusy} />
      <div className="field"><label>Açıklama</label><textarea className="input" required rows={3} value={f.description} onChange={set("description")} style={{ background: "#fff", fontSize: 15 }} /></div>
      <div className="field"><label>Neler öğrenilecek (her satır bir madde)</label><textarea className="input" rows={4} value={f.outcomes} onChange={set("outcomes")} style={{ background: "#fff", fontSize: 15 }} /></div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary blueprint" disabled={coverBusy}><Corners />Kaydet</button>
        {course.is_published && <Link href={`/kurslar/${course.slug}`} className="btn btn-secondary">Sayfayı gör</Link>}
        <Link href={`/ogrenim/${course.slug}`} className="btn btn-secondary">Önizle</Link>
        <span style={{ marginLeft: "auto" }} />
        {confirmDelete ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Vazgeç</button>
            <button type="button" className="btn btn-primary" style={{ background: "var(--color-accent-2)", borderColor: "var(--color-accent-2)" }} onClick={async () => (await run(adminApi("DELETE", `/api/admin/courses/${course.id}`))).ok && onDeleted()}>
              Evet, kursu ve tüm verisini sil
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>Kursu sil</button>
        )}
      </div>
    </form>
  );
}

function AddModule({ courseId, run }: { courseId: number; run: Run }) {
  const [title, setTitle] = useState("");
  return (
    <form
      style={{ display: "flex", gap: 10, marginTop: 20, maxWidth: 520 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await run(adminApi("POST", `/api/admin/courses/${courseId}/modules`, { title }), "Modül eklendi.")).ok) setTitle("");
      }}
    >
      <input className="input" required placeholder="Yeni modül başlığı" value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
      <button type="submit" className="btn btn-secondary">Modül ekle</button>
    </form>
  );
}

function ModuleCard({ mod, index, courseId, siblings, run }: { mod: AdminModule; index: number; courseId: number; siblings: AdminModule[]; run: Run }) {
  const [title, setTitle] = useState(mod.title);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  const moveModule = (dir: -1 | 1) => {
    const ids = siblings.map((m) => m.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(adminApi("PATCH", "/api/admin/modules/reorder", { course_id: courseId, ids }), "Sıra güncellendi.");
  };
  const moveLesson = (i: number, dir: -1 | 1) => {
    const ids = mod.lessons.map((l) => l.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(adminApi("PATCH", "/api/admin/lessons/reorder", { module_id: mod.id, ids }), "Sıra güncellendi.");
  };

  return (
    <div className="card blueprint" style={{ background: "#fff", padding: 20, gap: 14 }}>
      <Corners />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 600, color: "var(--color-accent)" }}>{String(index + 1).padStart(2, "0")}</span>
        <input className="input" aria-label="Modül başlığı" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== mod.title && run(adminApi("PATCH", `/api/admin/modules/${mod.id}`, { title }), "Modül adı güncellendi.")} style={{ ...input, flex: 1, fontFamily: "var(--font-heading)", fontSize: 20 }} />
        <button className="btn btn-icon btn-secondary" style={iconBtn} aria-label="Yukarı taşı" onClick={() => moveModule(-1)} disabled={index === 0}><ArrowUp size={16} strokeWidth={1.5} /></button>
        <button className="btn btn-icon btn-secondary" style={iconBtn} aria-label="Aşağı taşı" onClick={() => moveModule(1)} disabled={index === siblings.length - 1}><ArrowDown size={16} strokeWidth={1.5} /></button>
        <button className="btn btn-icon btn-secondary" style={iconBtn} aria-label="Modülü sil" onClick={() => confirm("Bu modül, dersleri ve sınavıyla birlikte silinsin mi?") && run(adminApi("DELETE", `/api/admin/modules/${mod.id}`), "Modül silindi.")}><Trash2 size={16} strokeWidth={1.5} /></button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {mod.lessons.map((l, i) =>
          editing === l.id ? (
            <LessonForm key={l.id} moduleId={mod.id} initial={l} submitLabel="Kaydet" onCancel={() => setEditing(null)} onSubmit={async (v) => (await run(adminApi("PATCH", `/api/admin/lessons/${l.id}`, v), "Ders güncellendi.")).ok && setEditing(null)} />
          ) : (
            <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", border: "1px solid var(--color-divider)" }}>
              {l.lesson_type === "video" ? <CirclePlay size={16} strokeWidth={1.5} /> : <FileText size={16} strokeWidth={1.5} />}
              <span style={{ flex: 1, fontSize: 15 }}>{l.title}{l.duration_minutes ? <span style={{ color: "var(--muted-55)" }}> · {l.duration_minutes} dk</span> : null}</span>
              <button className="btn btn-icon btn-ghost" style={iconBtn} aria-label="Düzenle" onClick={() => setEditing(l.id)}><Pencil size={15} strokeWidth={1.5} /></button>
              <button className="btn btn-icon btn-ghost" style={iconBtn} aria-label="Yukarı" onClick={() => moveLesson(i, -1)} disabled={i === 0}><ArrowUp size={15} strokeWidth={1.5} /></button>
              <button className="btn btn-icon btn-ghost" style={iconBtn} aria-label="Aşağı" onClick={() => moveLesson(i, 1)} disabled={i === mod.lessons.length - 1}><ArrowDown size={15} strokeWidth={1.5} /></button>
              <button className="btn btn-icon btn-ghost" style={iconBtn} aria-label="Sil" onClick={() => confirm("Bu ders silinsin mi?") && run(adminApi("DELETE", `/api/admin/lessons/${l.id}`), "Ders silindi.")}><Trash2 size={15} strokeWidth={1.5} /></button>
            </div>
          ),
        )}
        {adding ? (
          <LessonForm moduleId={mod.id} submitLabel="Ders ekle" onCancel={() => setAdding(false)} onSubmit={async (v) => (await run(adminApi("POST", `/api/admin/modules/${mod.id}/lessons`, v), "Ders eklendi.")).ok && setAdding(false)} />
        ) : (
          <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>+ Ders ekle</button>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
        <div className="card-kicker" style={{ marginBottom: 6 }}>Modül sınavı</div>
        <QuizRow quiz={mod.quiz} createUrl={`/api/admin/modules/${mod.id}/quizzes`} createBody={{ title: `${mod.title} — Sınav` }} run={run} />
      </div>
    </div>
  );
}

function LessonForm({ moduleId, initial, submitLabel, onSubmit, onCancel }: { moduleId: number; initial?: AdminLesson; submitLabel: string; onSubmit: (v: { title: string; lesson_type: "video" | "text"; content: string; duration_minutes: number }) => void; onCancel: () => void }) {
  const [v, setV] = useState({ title: initial?.title ?? "", lesson_type: initial?.lesson_type ?? ("text" as "video" | "text"), content: initial?.content ?? "", duration: initial?.duration_minutes == null ? "" : String(initial.duration_minutes) });
  const [uploading, setUploading] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.lesson_type === "video" && !v.content) return;
        onSubmit({ title: v.title, lesson_type: v.lesson_type, content: v.content, duration_minutes: Number(v.duration) });
      }}
      style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: "var(--color-accent-100)" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 110px", gap: 10 }}>
        <input className="input" required placeholder="Ders başlığı" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} style={input} />
        <select className="input" value={v.lesson_type} onChange={(e) => { const t = e.target.value as "video" | "text"; setV({ ...v, lesson_type: t, content: initial?.lesson_type === t ? initial.content : "" }); }} style={input}>
          <option value="text">Metin (Markdown)</option>
          <option value="video">Video</option>
        </select>
        <input className="input" type="number" required min={1} placeholder="Süre (dk)" value={v.duration} onChange={(e) => setV({ ...v, duration: e.target.value })} style={input} />
      </div>
      {v.lesson_type === "video" ? (
        <VideoUploadField
          moduleId={moduleId}
          lessonTitle={v.title}
          value={v.content}
          onChange={(key) => setV((cur) => ({ ...cur, content: key }))}
          onDuration={(m) => setV((cur) => (cur.duration === "" ? { ...cur, duration: String(m) } : cur))}
          onBusyChange={setUploading}
        />
      ) : (
        <textarea
          className="input"
          required
          rows={8}
          placeholder="Ders içeriği — Markdown desteklenir"
          value={v.content}
          onChange={(e) => setV({ ...v, content: e.target.value })}
          style={{ background: "#fff", fontSize: 14, fontFamily: "ui-monospace, monospace" }}
        />
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-primary" disabled={uploading || (v.lesson_type === "video" && !v.content)}>{submitLabel}</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Vazgeç</button>
      </div>
    </form>
  );
}

function QuizRow({ quiz, createUrl, createBody, run }: { quiz: AdminQuizRef | null; createUrl: string; createBody: Record<string, unknown>; run: Run }) {
  const router = useRouter();
  if (!quiz) {
    return (
      <button
        className="btn btn-secondary"
        onClick={async () => {
          const r = await adminApi("POST", createUrl, createBody);
          if (r.ok) router.push(`/admin/sinav/${r.json.quizId}`);
          else await run(Promise.resolve(r));
        }}
      >
        + Sınav oluştur
      </button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 15 }}>{quiz.title} <span style={{ color: "var(--muted-55)" }}>· {quiz.question_count} soru · geçme %{quiz.passing_score_percentage}</span></span>
      <Link href={`/admin/sinav/${quiz.id}`} className="btn btn-secondary" style={{ padding: "6px 14px" }}>Soruları düzenle</Link>
      <button className="btn btn-ghost" onClick={() => confirm("Sınav ve tüm soruları silinsin mi?") && run(adminApi("DELETE", `/api/admin/quizzes/${quiz.id}`), "Sınav silindi.")}>Sil</button>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Pencil, Trash2, Upload } from "lucide-react";
import type { LessonFileItem } from "@/lib/lesson-files";
import { formatFileSize } from "@/lib/lesson-file";
import { adminApi } from "./api";
import { uploadLessonFile } from "./lesson-file-upload";

type Props = { lessonId: number; files: LessonFileItem[] };

/**
 * Ders dosyaları: listeleme, yeniden adlandırma, silme ve çoklu yükleme.
 * Her işlem anında kalıcıdır (ders formunun "Kaydet"inden bağımsız); sonrasında sunucu verisi tazelenir.
 */
export function LessonFilesField({ lessonId, files }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState<{ name: string; progress: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const xhr = useRef<XMLHttpRequest | null>(null);

  useEffect(() => () => xhr.current?.abort(), []);

  async function uploadAll(list: FileList | File[]) {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    const problems: string[] = [];
    for (const f of Array.from(list)) {
      const problem = await uploadLessonFile(lessonId, f, (progress) => setCurrent({ name: f.name, progress }), (req) => { xhr.current = req; });
      if (problem) problems.push(problem);
    }
    setCurrent(null);
    setErrors(problems);
    setBusy(false);
    router.refresh();
  }

  async function rename(id: number) {
    const title = draft.trim();
    if (!title) return;
    const r = await adminApi("PATCH", `/api/admin/lesson-files/${id}`, { title });
    if (!r.ok) return setErrors([r.message]);
    setRenaming(null);
    router.refresh();
  }

  async function remove(f: LessonFileItem) {
    if (!confirm(`"${f.title}" dosyası silinsin mi?`)) return;
    const r = await adminApi("DELETE", `/api/admin/lesson-files/${f.id}`);
    if (!r.ok) return setErrors([r.message]);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "#fff", border: "1px dashed var(--color-divider)" }}>
      <div className="card-kicker">Ders dosyaları</div>

      {files.map((f) => (
        <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <Paperclip size={15} strokeWidth={1.5} />
          {renaming === f.id ? (
            <>
              <input className="input" aria-label="Görünen ad" maxLength={120} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void rename(f.id); } }} style={{ flex: 1, background: "#fff", fontSize: 14, minHeight: 32 }} />
              <button type="button" className="btn btn-secondary" onClick={() => void rename(f.id)}>Kaydet</button>
              <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>Vazgeç</button>
            </>
          ) : (
            <>
              <span style={{ flex: 1 }}>
                {f.title} <span style={{ color: "var(--muted-55)" }}>· {f.file_name} · {formatFileSize(f.size_bytes)}</span>
              </span>
              <button type="button" className="btn btn-icon btn-ghost" style={{ width: 32, height: 32 }} aria-label="Yeniden adlandır" onClick={() => { setRenaming(f.id); setDraft(f.title); }}><Pencil size={15} strokeWidth={1.5} /></button>
              <button type="button" className="btn btn-icon btn-ghost" style={{ width: 32, height: 32 }} aria-label="Dosyayı sil" onClick={() => void remove(f)}><Trash2 size={15} strokeWidth={1.5} /></button>
            </>
          )}
        </div>
      ))}

      {current ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{current.name}</span>
            <span>%{current.progress}</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={current.progress} style={{ height: 6, background: "var(--color-divider)" }}>
            <div style={{ height: "100%", width: `${current.progress}%`, background: "var(--color-accent-700)", transition: "width .2s" }} />
          </div>
          <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => xhr.current?.abort()}>İptal</button>
        </div>
      ) : (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) void uploadAll(e.dataTransfer.files); }}
          style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 14 }}
        >
          <Upload size={16} strokeWidth={1.5} />
          <span>Dosya seç ya da buraya sürükle <span style={{ color: "var(--muted-55)" }}>(her biri en çok 150 MB; .exe, .sh gibi çalıştırılabilir dosyalar yüklenemez)</span></span>
          <input type="file" multiple hidden onChange={(e) => { const list = e.target.files; const picked = list ? Array.from(list) : []; e.target.value = ""; if (picked.length) void uploadAll(picked); }} />
        </label>
      )}

      {errors.map((m) => <div key={m} role="alert" style={{ fontSize: 14, color: "#b00020" }}>{m}</div>)}
    </div>
  );
}

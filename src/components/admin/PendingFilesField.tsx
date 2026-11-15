"use client";

import { useState } from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { formatFileSize } from "@/lib/lesson-file";
import { lessonFileProblem } from "./lesson-file-upload";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  /** Ders kaydedilirken yüklenmekte olan dosya; doluyken liste kilitlenir. */
  current: { name: string; progress: number } | null;
  locked: boolean;
  onCancelUpload: () => void;
};

/**
 * Yeni ders formunda dosya seçimi: dosyalar yalnızca bekletilir, "Ders ekle"ye basınca ders oluşturulup R2'ye yüklenir.
 */
export function PendingFilesField({ files, onChange, current, locked, onCancelUpload }: Props) {
  const [errors, setErrors] = useState<string[]>([]);

  function add(list: File[]) {
    const problems: string[] = [];
    const next = [...files];
    for (const f of list) {
      const problem = lessonFileProblem(f);
      if (problem) problems.push(problem);
      else if (!next.some((n) => n.name === f.name && n.size === f.size && n.lastModified === f.lastModified)) next.push(f);
    }
    setErrors(problems);
    onChange(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "#fff", border: "1px dashed var(--color-divider)" }}>
      <div className="card-kicker">Ders dosyaları</div>

      {files.map((f, i) => (
        <div key={`${f.name}-${f.size}-${f.lastModified}`} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <Paperclip size={15} strokeWidth={1.5} />
          <span style={{ flex: 1 }}>
            {f.name} <span style={{ color: "var(--muted-55)" }}>· {formatFileSize(f.size)}</span>
          </span>
          {!locked && (
            <button type="button" className="btn btn-icon btn-ghost" style={{ width: 32, height: 32 }} aria-label="Listeden çıkar" onClick={() => onChange(files.filter((_, j) => j !== i))}><Trash2 size={15} strokeWidth={1.5} /></button>
          )}
        </div>
      ))}

      {current && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Yükleniyor: {current.name}</span>
            <span>%{current.progress}</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={current.progress} style={{ height: 6, background: "var(--color-divider)" }}>
            <div style={{ height: "100%", width: `${current.progress}%`, background: "var(--color-accent-700)", transition: "width .2s" }} />
          </div>
          <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onCancelUpload}>Yüklemeyi iptal et</button>
        </div>
      )}

      {!locked && (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) add(Array.from(e.dataTransfer.files)); }}
          style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 14 }}
        >
          <Upload size={16} strokeWidth={1.5} />
          <span>Dosya seç ya da buraya sürükle <span style={{ color: "var(--muted-55)" }}>(her biri en çok 150 MB; dosyalar ders eklenince yüklenir; .exe, .sh gibi çalıştırılabilir dosyalar yüklenemez)</span></span>
          <input type="file" multiple hidden onChange={(e) => { const list = e.target.files; const picked = list ? Array.from(list) : []; e.target.value = ""; if (picked.length) add(picked); }} />
        </label>
      )}

      {errors.map((m) => <div key={m} role="alert" style={{ fontSize: 14, color: "#b00020" }}>{m}</div>)}
    </div>
  );
}

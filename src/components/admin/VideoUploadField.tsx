"use client";

import { useEffect, useRef, useState } from "react";
import { CirclePlay, Upload } from "lucide-react";
import { adminApi } from "./api";

type Props = {
  moduleId: number;
  lessonTitle: string;
  value: string; // yüklenmiş videonun R2 anahtarı ("" = henüz yok)
  onChange: (key: string) => void;
  onDuration: (minutes: number) => void;
  onBusyChange: (busy: boolean) => void; // yükleme sürerken formun "Kaydet"i kapatılır
};

const MAX_BYTES = 2_147_483_648;

/** Tarayıcıdan dosyanın süresini (dk) okur; okunamazsa null. */
function readDurationMinutes(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (m: number | null) => { URL.revokeObjectURL(url); resolve(m); };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.max(1, Math.round(v.duration / 60)) : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

export function VideoUploadField({ moduleId, lessonTitle, value, onChange, onDuration, onBusyChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null); // null = yüklenmiyor
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => xhr.current?.abort(), []);

  async function upload(f: File) {
    setError(null);
    if (!/\.mp4$/i.test(f.name) || (f.type && f.type !== "video/mp4")) return setError("Yalnızca MP4 dosyası yüklenebilir.");
    if (f.size > MAX_BYTES) return setError("Video en çok 2 GB olabilir.");
    setFile(f);
    setProgress(0);
    onBusyChange(true);
    try {
      const minutes = await readDurationMinutes(f);
      if (minutes) onDuration(minutes);

      const init = await adminApi("POST", "/api/admin/uploads/video", { module_id: moduleId, lesson_title: lessonTitle.trim() || "ders", content_type: "video/mp4", size: f.size });
      if (!init.ok) throw new Error(init.message);
      const { key, upload: u } = init.json as { key: string; upload: { url: string; headers: Record<string, string> } };

      await new Promise<void>((resolve, reject) => {
        const req = new XMLHttpRequest();
        xhr.current = req;
        req.open("PUT", u.url);
        for (const [k, val] of Object.entries(u.headers)) req.setRequestHeader(k, val);
        req.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
        req.onload = () => (req.status >= 200 && req.status < 300 ? resolve() : reject(new Error(`Yükleme başarısız (${req.status}).`)));
        req.onerror = () => reject(new Error("Bağlantı hatası; yükleme yarıda kaldı."));
        req.onabort = () => reject(new Error("Yükleme iptal edildi."));
        req.send(f);
      });
      onChange(key);
      setReplacing(false);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme başarısız.");
    } finally {
      xhr.current = null;
      setProgress(null);
      onBusyChange(false);
    }
  }

  const uploading = progress !== null;
  const showPicker = !value || replacing;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, background: "#fff", border: "1px dashed var(--color-divider)" }}>
      {!showPicker && !uploading && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
          <CirclePlay size={16} strokeWidth={1.5} />
          <span>Video yüklendi ✓ <span style={{ color: "var(--muted-55)" }}>· {value.split("/").pop()}</span></span>
          <button type="button" className="btn btn-ghost" onClick={() => setReplacing(true)}>Değiştir</button>
        </div>
      )}

      {showPicker && !uploading && (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
          style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 14 }}
        >
          <Upload size={16} strokeWidth={1.5} />
          <span>MP4 dosyasını seç ya da buraya sürükle <span style={{ color: "var(--muted-55)" }}>(en çok 2 GB)</span></span>
          <input ref={input} type="file" accept="video/mp4,.mp4" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        </label>
      )}

      {uploading && file && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{file.name} · {(file.size / 1_048_576).toFixed(0)} MB</span>
            <span>%{progress}</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} style={{ height: 6, background: "var(--color-divider)" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "var(--color-accent-700)", transition: "width .2s" }} />
          </div>
          <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => xhr.current?.abort()}>İptal</button>
        </div>
      )}

      {error && (
        <div role="alert" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 14, color: "#b00020" }}>
          {error}
          {file && <button type="button" className="btn btn-secondary" onClick={() => void upload(file)}>Tekrar dene</button>}
        </div>
      )}
    </div>
  );
}

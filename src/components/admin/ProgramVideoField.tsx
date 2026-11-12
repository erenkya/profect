"use client";

import { useEffect, useRef, useState } from "react";
import { CirclePlay, Upload } from "lucide-react";
import { MAX_VIDEO_BYTES } from "@/lib/video-key";
import { adminApi } from "./api";

type Props = {
  programId: number;
  value: string | null; // yüklenmiş tanıtım videosunun R2 anahtarı (null = yok)
  onChange: (key: string | null) => void;
  onBusyChange: (busy: boolean) => void; // yükleme sürerken formun "Kaydet"i kapatılır
};

/** Program tanıtım videosu: MP4 seçilir, doğrudan R2'ye yüklenir. Program kaydedilince kalıcı olur. */
export function ProgramVideoField({ programId, value, onChange, onBusyChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null); // null = yüklenmiyor
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const xhr = useRef<XMLHttpRequest | null>(null);

  useEffect(() => () => xhr.current?.abort(), []);

  async function upload(f: File) {
    setError(null);
    if (!/\.mp4$/i.test(f.name) || (f.type && f.type !== "video/mp4")) return setError("Yalnızca MP4 dosyası yüklenebilir.");
    if (f.size > MAX_VIDEO_BYTES) return setError("Video en çok 2 GB olabilir.");
    setFile(f);
    setProgress(0);
    onBusyChange(true);
    try {
      const init = await adminApi("POST", "/api/admin/uploads/program-video", { program_id: programId, content_type: "video/mp4", size: f.size });
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
      setPreviewing(false);
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

  return (
    <div className="field">
      <label>Tanıtım videosu</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: "#fff", border: "1px dashed var(--color-divider)", fontSize: 14 }}>
        {uploading && file ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{file.name} · {(file.size / 1_048_576).toFixed(0)} MB</span>
              <span>%{progress}</span>
            </div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} style={{ height: 6, background: "var(--color-divider)" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "var(--color-accent-700)", transition: "width .2s" }} />
            </div>
            <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => xhr.current?.abort()}>İptal</button>
          </>
        ) : (
          <>
            <span style={{ color: "var(--muted-55)" }}>MP4 · en çok 2 GB · program sayfasında kapak resminin yerine herkese açık tanıtım videosu olarak gösterilir</span>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {value && (
                <>
                  <CirclePlay size={16} strokeWidth={1.5} aria-hidden />
                  <span>Video yüklendi ✓ <span style={{ color: "var(--muted-55)" }}>· {value.split("/").pop()}</span></span>
                  <button type="button" className="btn btn-ghost" onClick={() => setPreviewing((p) => !p)}>{previewing ? "Önizlemeyi kapat" : "İzle"}</button>
                </>
              )}
              <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                <Upload size={15} strokeWidth={1.5} aria-hidden /> {value ? "Videoyu değiştir" : "Video seç"}
                <input type="file" accept="video/mp4,.mp4" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
              </label>
              {value && <button type="button" className="btn btn-ghost" onClick={() => { setPreviewing(false); onChange(null); }}>Kaldır</button>}
            </div>
            {value && <span style={{ color: "var(--muted-55)" }}>Değişiklik, kaydedilince geçerli olur.</span>}
            {value && previewing && (
              <video
                key={value}
                src={`/api/admin/uploads/video/preview?key=${encodeURIComponent(value)}`}
                controls
                playsInline
                preload="metadata"
                style={{ width: "100%", maxWidth: 640, aspectRatio: "16/9", background: "#0b0b14" }}
              />
            )}
          </>
        )}
        {error && (
          <div role="alert" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", color: "#b00020" }}>
            {error}
            {file && <button type="button" className="btn btn-secondary" onClick={() => void upload(file)}>Tekrar dene</button>}
          </div>
        )}
      </div>
    </div>
  );
}

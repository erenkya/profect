"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { COVER_TYPES, MAX_COVER_BYTES, coverUrl, isCoverType } from "@/lib/cover-key";
import { adminApi } from "./api";

type Props = {
  courseId: number;
  value: string | null; // yüklenmiş kapağın R2 anahtarı (null = yok)
  onChange: (key: string | null) => void;
  onBusyChange: (busy: boolean) => void; // yükleme sürerken formun "Kaydet"i kapatılır
};

/** Kurs kapak resmi: JPG/PNG/WebP seçilir, doğrudan R2'ye yüklenir. Kurs kaydedilince kalıcı olur. */
export function CoverUploadField({ courseId, value, onChange, onBusyChange }: Props) {
  const [progress, setProgress] = useState<number | null>(null); // null = yüklenmiyor
  const [error, setError] = useState<string | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);

  useEffect(() => () => xhr.current?.abort(), []);

  async function upload(f: File) {
    setError(null);
    if (!isCoverType(f.type)) return setError("Yalnızca JPG, PNG veya WebP yüklenebilir.");
    if (f.size > MAX_COVER_BYTES) return setError("Kapak resmi en çok 5 MB olabilir.");
    setProgress(0);
    onBusyChange(true);
    try {
      const init = await adminApi("POST", "/api/admin/uploads/cover", { course_id: courseId, content_type: f.type, size: f.size });
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme başarısız.");
    } finally {
      xhr.current = null;
      setProgress(null);
      onBusyChange(false);
    }
  }

  const uploading = progress !== null;
  const src = coverUrl(value);

  return (
    <div className="field">
      <label>Kapak resmi</label>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: 12, background: "#fff", border: "1px dashed var(--color-divider)" }}>
        <div style={{ width: 160, height: 90, background: "var(--color-divider)", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
          {src ? <img src={src} alt="Kapak önizlemesi" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImagePlus size={24} strokeWidth={1.5} aria-hidden />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, minWidth: 200 }}>
          {uploading ? (
            <>
              <span>Yükleniyor… %{progress}</span>
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} style={{ height: 6, background: "var(--color-divider)" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "var(--color-accent-700)", transition: "width .2s" }} />
              </div>
              <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => xhr.current?.abort()}>İptal</button>
            </>
          ) : (
            <>
              <span style={{ color: "var(--muted-55)" }}>JPG, PNG veya WebP · en çok 5 MB · önerilen oran 16:9</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                  {src ? "Resmi değiştir" : "Resim seç"}
                  <input type="file" accept={Object.keys(COVER_TYPES).join(",")} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
                </label>
                {value && <button type="button" className="btn btn-ghost" onClick={() => onChange(null)}>Kaldır</button>}
              </div>
              {value && <span style={{ color: "var(--muted-55)" }}>Değişiklik, kurs kaydedilince geçerli olur.</span>}
            </>
          )}
          {error && <div role="alert" style={{ color: "#b00020" }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

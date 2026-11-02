"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { POST_IMAGE_TYPES, postImageUrl } from "@/lib/post-key";
import { uploadPostImage } from "./post-image-upload";

type Props = {
  value: string | null; // yüklenmiş kapağın R2 anahtarı (null = yok)
  onChange: (key: string | null) => void;
  onBusyChange: (busy: boolean) => void; // yükleme sürerken formun "Kaydet"i kapatılır
};

/** Yazı kapak görseli: JPG/PNG/WebP/GIF seçilir, doğrudan R2'ye yüklenir. Yazı kaydedilince kalıcı olur. */
export function PostCoverField({ value, onChange, onBusyChange }: Props) {
  const [progress, setProgress] = useState<number | null>(null); // null = yüklenmiyor
  const [error, setError] = useState<string | null>(null);

  async function upload(f: File) {
    setError(null);
    setProgress(0);
    onBusyChange(true);
    try {
      onChange(await uploadPostImage(f, setProgress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme başarısız.");
    } finally {
      setProgress(null);
      onBusyChange(false);
    }
  }

  const src = postImageUrl(value);
  return (
    <div className="field">
      <label>Kapak görseli</label>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: 12, background: "#fff", border: "1px dashed var(--color-divider)" }}>
        <div style={{ width: 160, height: 90, background: "var(--color-divider)", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>
          {src ? <img src={src} alt="Kapak önizlemesi" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImagePlus size={24} strokeWidth={1.5} aria-hidden />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, minWidth: 200 }}>
          {progress !== null ? (
            <>
              <span>Yükleniyor… %{progress}</span>
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={{ height: 6, background: "var(--color-divider)" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "var(--color-accent-700)", transition: "width .2s" }} />
              </div>
            </>
          ) : (
            <>
              <span style={{ color: "var(--muted-55)" }}>JPG, PNG, WebP veya GIF · en çok 8 MB · önerilen oran 16:9</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                  {src ? "Görseli değiştir" : "Görsel seç"}
                  <input type="file" accept={Object.keys(POST_IMAGE_TYPES).join(",")} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
                </label>
                {value && <button type="button" className="btn btn-ghost" onClick={() => onChange(null)}>Kaldır</button>}
              </div>
            </>
          )}
          {error && <div role="alert" style={{ color: "#b00020" }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

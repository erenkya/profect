"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check } from "lucide-react";
import { Corners } from "@/components/Corners";

type Props = {
  lessonId: number;
  type: "video" | "text";
  videoReady: boolean; // video: R2'ye yüklenmiş mi (anahtarın kendisi istemciye gönderilmez)
  markdown: string; // text: Markdown içeriği
  initiallyCompleted: boolean;
  canTrack: boolean; // yönetici önizlemesinde ilerleme kaydedilmez
  nextHref: string | null;
  nextLabel: string | null;
};

const COMPLETE_RATIO = 0.95;

export function LessonPlayer({ lessonId, type, videoReady, markdown, initiallyCompleted, canTrack, nextHref, nextLabel }: Props) {
  const router = useRouter();
  const [completed, setCompleted] = useState(initiallyCompleted);
  const [videoError, setVideoError] = useState<string | null>(null);
  const sent = useRef(initiallyCompleted);
  const sentinel = useRef<HTMLDivElement>(null);
  const videoSrc = `/api/client/lessons/${lessonId}/video`;

  async function markComplete() {
    if (sent.current) return;
    sent.current = true;
    setCompleted(true);
    if (!canTrack) return;
    try {
      const res = await fetch("/api/client/progress/lesson", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId }),
      });
      if (!res.ok) {
        sent.current = false;
        setCompleted(false);
        return;
      }
      // Kenar çubuğu (tamamlandı işaretleri, ilerleme yüzdesi) sunucu layout'unda; yeniden çek.
      router.refresh();
    } catch {
      sent.current = false;
      setCompleted(false);
    }
  }

  // Metin dersi: içeriğin sonu görünür olunca tamamlandı say (IntersectionObserver).
  useEffect(() => {
    if (type !== "text" || sent.current || !sentinel.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && markComplete(), { threshold: 1 });
    io.observe(sentinel.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, lessonId]);

  // Oynatma hatasının nedenini sunucunun durum kodundan anla (oturum bitti / erişim yok / kota doldu).
  async function explainVideoError() {
    let msg = "Video yüklenemedi. Sayfayı yenileyip tekrar dene.";
    try {
      const res = await fetch(videoSrc, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
      if (res.status === 401) msg = "Oturumun sona erdi. Lütfen yeniden giriş yap.";
      else if (res.status === 403) msg = "Bu kursa erişimin yok.";
      else if (res.status === 404) msg = "Bu dersin video dosyası bulunamadı.";
      else if (res.status === 429) msg = "Bu video için günlük izleme sınırına ulaşıldı. Daha sonra tekrar dene.";
    } catch {
      /* ağ hatası: genel mesaj */
    }
    setVideoError(msg);
  }

  return (
    <div>
      {type === "video" ? (
        videoReady ? (
          <div className="lesson-video" style={{ position: "relative", aspectRatio: "16/9", background: "#0b0b14", maxWidth: 960 }}>
            <video
              key={lessonId}
              src={videoSrc}
              controls
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              playsInline
              preload="metadata"
              onContextMenu={(e) => e.preventDefault()}
              onEnded={markComplete}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration > 0 && v.currentTime / v.duration >= COMPLETE_RATIO) markComplete();
              }}
              onError={explainVideoError}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
            {videoError && (
              <div role="alert" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(11,11,20,0.92)", color: "#fff", padding: 24, textAlign: "center" }}>
                {videoError}
              </div>
            )}
          </div>
        ) : (
          <div role="status" className="lesson-video" style={{ aspectRatio: "16/9", maxWidth: 960, display: "grid", placeItems: "center", background: "#0b0b14", color: "#fff", padding: 24, textAlign: "center" }}>
            Bu dersin videosu henüz yüklenmedi.
          </div>
        )
      ) : (
        <article className="md lesson-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          <div ref={sentinel} style={{ height: 1 }} />
        </article>
      )}

      <div className="lesson-foot" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 32 }}>
        {completed && (
          <span className="lesson-done" style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 14, color: "var(--color-accent-700)" }}>
            <Check size={18} strokeWidth={1.5} /> Ders tamamlandı
          </span>
        )}
        {nextHref && (
          <Link href={nextHref} className="btn btn-primary blueprint lesson-next" style={{ fontSize: 16, padding: "10px 22px", marginLeft: "auto" }}>
            <Corners />
            {nextLabel ?? "Sonraki"} <span className="lesson-arrow" aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

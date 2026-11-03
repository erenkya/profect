"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check } from "lucide-react";
import { Corners } from "@/components/Corners";
import { useHandsFree } from "./useHandsFree";

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
const ADVANCE_SECONDS = 5; // eller serbest modda video bittikten sonra sıradakine geçmeden önceki bekleme

export function LessonPlayer({ lessonId, type, videoReady, markdown, initiallyCompleted, canTrack, nextHref, nextLabel }: Props) {
  const router = useRouter();
  const [completed, setCompleted] = useState(initiallyCompleted);
  const [videoError, setVideoError] = useState<string | null>(null);
  const sent = useRef(initiallyCompleted);
  const sentinel = useRef<HTMLDivElement>(null);
  const videoEl = useRef<HTMLVideoElement>(null);
  const videoSrc = `/api/client/lessons/${lessonId}/video`;
  const [handsFree, setHandsFree] = useHandsFree();
  const [countdown, setCountdown] = useState<number | null>(null); // null: geri sayım yok
  const [needsTap, setNeedsTap] = useState(false); // tarayıcı otomatik oynatmayı engelledi
  const canAdvance = type === "video" && !!nextHref;

  // Eller serbest: ders açılır açılmaz oynat. Tarayıcı izin vermezse (kullanıcı etkileşimi yok) dokunma ipucu göster.
  useEffect(() => {
    const v = videoEl.current;
    if (!handsFree || type !== "video" || !v) return;
    v.play().catch(() => setNeedsTap(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // Video bitince geri sayım başlar; süre dolunca sıradaki ders/sınav sayfasına geçilir (sınav otomatik başlamaz).
  useEffect(() => {
    if (countdown === null || !nextHref) return;
    if (countdown <= 0) {
      router.push(nextHref);
      return;
    }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, nextHref, router]);

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
              ref={videoEl}
              key={lessonId}
              src={videoSrc}
              controls
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              playsInline
              preload="metadata"
              onContextMenu={(e) => e.preventDefault()}
              onPlay={() => {
                setNeedsTap(false);
                setCountdown(null); // geri sayım sırasında tekrar izlemeye başlandı
              }}
              onEnded={() => {
                markComplete();
                if (handsFree && canAdvance) setCountdown(ADVANCE_SECONDS);
              }}
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration > 0 && v.currentTime / v.duration >= COMPLETE_RATIO) markComplete();
              }}
              onError={explainVideoError}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
            {needsTap && !videoError && (
              <button
                type="button"
                onClick={() => videoEl.current?.play().catch(() => {})}
                style={{ position: "absolute", inset: 0, width: "100%", background: "rgba(11,11,20,0.6)", color: "#fff", border: 0, fontSize: 18, cursor: "pointer" }}
              >
                Eller serbest mod: başlatmak için dokun
              </button>
            )}
            {countdown !== null && nextHref && (
              <div role="status" aria-live="polite" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", alignContent: "center", gap: 16, background: "rgba(11,11,20,0.85)", color: "#fff", padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>{nextLabel ?? "Sonraki"}: {countdown} sn</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                  <button type="button" className="btn btn-primary" onClick={() => router.push(nextHref)}>Şimdi geç</button>
                  <button type="button" className="btn" onClick={() => setCountdown(null)}>İptal</button>
                </div>
              </div>
            )}
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
        {type === "video" && videoReady && nextHref && (
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} />
            Eller serbest mod (video bitince otomatik sıradakine geç)
          </label>
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

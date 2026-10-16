"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check } from "lucide-react";
import { Corners } from "@/components/Corners";

type Props = {
  lessonId: number;
  type: "video" | "text";
  content: string; // video: YouTube ID veya "vimeo:ID" · text: Markdown
  initiallyCompleted: boolean;
  canTrack: boolean; // yönetici önizlemesinde ilerleme kaydedilmez
  nextHref: string | null;
  nextLabel: string | null;
};

type YTPlayer = { getCurrentTime(): number; getDuration(): number; destroy(): void };
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { ENDED: number; PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function LessonPlayer({ lessonId, type, content, initiallyCompleted, canTrack, nextHref, nextLabel }: Props) {
  const [completed, setCompleted] = useState(initiallyCompleted);
  const sent = useRef(initiallyCompleted);
  const sentinel = useRef<HTMLDivElement>(null);
  const ytHost = useRef<HTMLDivElement>(null);

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
      }
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

  // Video dersi (YouTube): bitişte ya da %95'e ulaşınca tamamlandı say.
  const isYouTube = type === "video" && !content.startsWith("vimeo:");
  useEffect(() => {
    if (!isYouTube || !ytHost.current) return;
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    const create = () => {
      if (cancelled || !window.YT || !ytHost.current) return;
      const mount = document.createElement("div");
      ytHost.current.innerHTML = "";
      ytHost.current.appendChild(mount);
      player = new window.YT.Player(mount, {
        videoId: content,
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === window.YT!.PlayerState.ENDED) markComplete();
          },
        },
      });
      timer = setInterval(() => {
        try {
          const d = player?.getDuration() ?? 0;
          if (d > 0 && player!.getCurrentTime() / d >= 0.95) markComplete();
        } catch {
          /* oynatıcı henüz hazır değil */
        }
      }, 2000);
    };

    if (window.YT?.Player) create();
    else {
      window.onYouTubeIframeAPIReady = create;
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      try {
        player?.destroy();
      } catch {
        /* yok say */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, content, lessonId]);

  return (
    <div>
      {type === "video" ? (
        <div style={{ aspectRatio: "16/9", background: "#0b0b14", maxWidth: 960 }}>
          {isYouTube ? (
            <div ref={ytHost} style={{ width: "100%", height: "100%" }} />
          ) : (
            <iframe
              title="Ders videosu"
              src={`https://player.vimeo.com/video/${content.slice(6)}`}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              style={{ width: "100%", height: "100%", border: 0 }}
            />
          )}
        </div>
      ) : (
        <article className="md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          <div ref={sentinel} style={{ height: 1 }} />
        </article>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 32 }}>
        {!completed && type === "video" && !isYouTube && (
          <button className="btn btn-secondary" onClick={markComplete}>Dersi tamamladım</button>
        )}
        {completed && (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 14, color: "var(--color-accent-700)" }}>
            <Check size={18} strokeWidth={1.5} /> Ders tamamlandı
          </span>
        )}
        {nextHref && (
          <Link href={nextHref} className="btn btn-primary blueprint" style={{ fontSize: 16, padding: "10px 22px" }}>
            <Corners />
            {nextLabel ?? "Sonraki"} →
          </Link>
        )}
      </div>
    </div>
  );
}

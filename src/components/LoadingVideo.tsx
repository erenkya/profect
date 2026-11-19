"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type VideoHTMLAttributes } from "react";

type Props = VideoHTMLAttributes<HTMLVideoElement> & {
  ref?: React.Ref<HTMLVideoElement>;
  wrapperStyle?: CSSProperties;
  wrapperClassName?: string;
  children?: ReactNode; // video üzerine bindirilen katmanlar (hata, geri sayım vb.)
};

// Video yüklenirken / tamponlanırken ortada dönen yükleme göstergesi çıkarır.
export function LoadingVideo({ ref, wrapperStyle, wrapperClassName, children, onLoadStart, onLoadedMetadata, onWaiting, onSeeking, onCanPlay, onPlaying, onSeeked, onError, style, ...video }: Props) {
  const inner = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [ratio, setRatio] = useState<{ w: number; h: number } | null>(null); // videonun gerçek en/boy oranı

  function measure(v: HTMLVideoElement) {
    if (v.videoWidth && v.videoHeight) setRatio({ w: v.videoWidth, h: v.videoHeight });
  }

  // Hydration'dan önce yüklenmiş olabilir; olay kaçtıysa durumu elemandan oku.
  useEffect(() => {
    const v = inner.current;
    if (v && v.readyState >= 1) {
      setLoading(false);
      measure(v);
    }
  }, []);

  // Oynatıcı videonun oranına uyar; dikey videoda ekran yüksekliğini aşmayacak şekilde daralıp ortalanır.
  const portrait = !!ratio && ratio.h > ratio.w;
  const baseMax = wrapperStyle?.maxWidth;
  const fit: CSSProperties = ratio
    ? {
        aspectRatio: `${ratio.w} / ${ratio.h}`,
        ...(portrait && {
          maxWidth: `min(${typeof baseMax === "number" ? `${baseMax}px` : (baseMax ?? "100%")}, calc(75vh * ${ratio.w / ratio.h}))`,
          marginInline: "auto",
        }),
      }
    : {};

  return (
    <div className={wrapperClassName} style={{ position: "relative", background: "#0b0b14", ...wrapperStyle, ...fit }}>
      <video
        {...video}
        ref={(el) => {
          inner.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        style={{ width: "100%", height: "100%", display: "block", objectFit: "contain", ...style }}
        onLoadStart={(e) => { setLoading(true); onLoadStart?.(e); }}
        onLoadedMetadata={(e) => { setLoading(false); measure(e.currentTarget); onLoadedMetadata?.(e); }}
        onWaiting={(e) => { setLoading(true); onWaiting?.(e); }}
        onSeeking={(e) => { setLoading(true); onSeeking?.(e); }}
        onCanPlay={(e) => { setLoading(false); onCanPlay?.(e); }}
        onPlaying={(e) => { setLoading(false); onPlaying?.(e); }}
        onSeeked={(e) => { setLoading(false); onSeeked?.(e); }}
        onError={(e) => { setLoading(false); onError?.(e); }}
      />
      {loading && (
        <div role="status" aria-live="polite" className="video-loading">
          <span className="video-spinner" aria-hidden />
          <span className="sr-only">Video yükleniyor…</span>
        </div>
      )}
      {children}
    </div>
  );
}

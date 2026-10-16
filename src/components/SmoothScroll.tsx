"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Tekerlek/dokunmatik kaydırmayı yumuşatır (Lenis). Çapa bağlantıları (#nasil, /#sertifika)
 * da aynı eğriyle kayar. Hareketi azalt tercihi varsa hiçbir şey yapmaz.
 * Kendi içinde kayan alanlara (ör. ödeme penceresi) `data-lenis-prevent` ekleyin.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.1,
      anchors: { offset: -70 }, // sticky nav payı
    });

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

/**
 * Sayfa genelindeki hareketler: kaydırma ilerleme çubuğu, görünür olunca belirme,
 * paralaks/süzülme, kayan şerit ve çizgi çizme. Elemanlar data-* nitelikleriyle işaretlenir:
 *   data-reveal / data-delay · data-fx (data-py, data-pxx, data-rot, data-br, data-fl, data-ph)
 *   data-marquee · data-draw · data-progress
 */
export function Motion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const ease = "cubic-bezier(.2,.7,.2,1)";

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          const d = Number(el.dataset.delay || 0);
          el.style.transition = `opacity .9s ${ease} ${d}ms, transform .9s ${ease} ${d}ms`;
          el.style.opacity = "1";
          el.style.transform = "";
          io.unobserve(el);
        }),
      { threshold: 0.12 },
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-rv])").forEach((el) => {
        el.setAttribute("data-rv", "1");
        if (reduce) return;
        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.transform = "translateY(32px)";
        io.observe(el);
      });
    };

    let scanQueued = false;
    const mo = new MutationObserver(() => {
      if (scanQueued) return;
      scanQueued = true;
      requestAnimationFrame(() => {
        scanQueued = false;
        scan();
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    scan();

    let raf = 0;
    const tick = () => {
      const vh = window.innerHeight;
      const sy = window.scrollY;
      const max = document.documentElement.scrollHeight - vh;
      const bar = document.querySelector<HTMLElement>("[data-progress]");
      if (bar) bar.style.width = (max > 0 ? (sy / max) * 100 : 0) + "%";

      if (!reduce) {
        const t = (performance.now() - t0) / 1000;
        document.querySelectorAll<HTMLElement>("[data-fx]").forEach((el) => {
          const p = el.parentElement!.getBoundingClientRect();
          if (p.bottom < -200 || p.top > vh + 200) return;
          const c = p.top + p.height / 2 - vh / 2;
          const d = el.dataset;
          const y = -c * (Number(d.py) || 0) + (d.fl ? Math.sin(t * 0.9 + (Number(d.ph) || 0)) * Number(d.fl) : 0);
          const x = -c * (Number(d.pxx) || 0);
          const r = (Number(d.br) || 0) + c * (Number(d.rot) || 0);
          el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${r.toFixed(2)}deg)`;
        });
        document.querySelectorAll<HTMLElement>("[data-marquee]").forEach((el) => {
          const w = el.scrollWidth / 2;
          if (w) el.style.transform = `translate3d(${-((t * 45) % w).toFixed(1)}px,0,0)`;
        });
        document.querySelectorAll<SVGPathElement>("[data-draw]").forEach((el) => {
          const r = el.ownerSVGElement!.getBoundingClientRect();
          const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.5)));
          el.style.strokeDashoffset = String(1 - p);
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      mo.disconnect();
      // Strict Mode'da efekt iki kez çalışır: gizlenmiş ama henüz gösterilmemiş elemanları
      // sıfırla ki bir sonraki scan() onları yeniden gözlemlesin.
      document.querySelectorAll<HTMLElement>("[data-rv]").forEach((el) => {
        el.removeAttribute("data-rv");
        el.style.transition = "";
        el.style.opacity = "";
        el.style.transform = "";
      });
    };
  }, []);

  return (
    <div aria-hidden style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 60, pointerEvents: "none" }}>
      <div
        data-progress="1"
        style={{ height: "100%", width: "0%", background: "linear-gradient(90deg,#3a5fdc 0 50%,#4a2a9e 50% 100%)" }}
      />
    </div>
  );
}

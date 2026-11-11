"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Corners } from "@/components/Corners";

const SLIDES = [
  "/images/hero/tedarik-analizi.png",
  "/images/hero/sozlesme.png",
  "/images/hero/uyum.png",
];
const INTERVAL_MS = 4500;

/** Hero kompozisyonunun ortasında, yumuşak geçişle dönen fotoğraf çerçevesi. */
export function HeroSlides() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="blueprint elev-md" style={{ position: "relative", width: "100%", aspectRatio: "4/3", background: "#ffffff" }}>
      <Corners />
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {SLIDES.map((src, i) => (
          <Image
            key={src}
            src={src}
            alt=""
            fill
            sizes="(max-width: 900px) 72vw, 340px"
            priority={i === 0}
            style={{ objectFit: "cover", opacity: i === active ? 1 : 0, transition: "opacity 900ms ease" }}
          />
        ))}
      </div>
    </div>
  );
}

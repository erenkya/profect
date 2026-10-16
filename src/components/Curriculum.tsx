"use client";

import { useState } from "react";
import type { CurriculumModule } from "@/data/courses";

export function Curriculum({ modules }: { modules: CurriculumModule[] }) {
  const [open, setOpen] = useState<number>(0);

  return (
    <div style={{ borderTop: "1px solid var(--color-divider)" }}>
      {modules.map((m, i) => {
        const isOpen = open === i;
        return (
          <div key={m.n + m.title} style={{ borderBottom: "1px solid var(--color-divider)" }}>
            <button
              type="button"
              className="mod-btn"
              aria-expanded={isOpen}
              aria-controls={`mod-${i}`}
              onClick={() => setOpen(isOpen ? -1 : i)}
            >
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 600, color: "var(--color-accent)" }}>{m.n}</span>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600 }}>{m.title}</span>
              <span className="mod-meta" style={{ fontSize: 13, color: "var(--muted-55)" }}>{m.meta}</span>
              <span aria-hidden style={{ fontSize: 22, color: "var(--color-accent-2)", textAlign: "center" }}>{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div id={`mod-${i}`} style={{ padding: "0 4px 22px clamp(20px,6vw,76px)", display: "flex", flexDirection: "column", gap: 10 }}>
                {m.items.map((li) => (
                  <div key={li.t} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 15 }}>
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span className="diamond" style={{ width: 7, height: 7, background: li.c, flex: "none" }} />
                      {li.t}
                    </span>
                    <span style={{ color: "color-mix(in srgb,var(--color-text) 50%,transparent)", fontSize: 13 }}>{li.d}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

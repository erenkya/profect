"use client";

import { useId, useRef } from "react";
import { X } from "lucide-react";

/** Metin bağlantısı + açılır pencere (native <dialog>). Onay kutusunun <label>'ı içinde kullanılabilir. */
export function LegalDialog({ title, children, trigger }: { title: string; children: React.ReactNode; trigger: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", textDecoration: "underline", color: "var(--color-accent-600)" }}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClick={(e) => { e.preventDefault(); if (e.target === ref.current) ref.current?.close(); }}
        style={{ border: "1px solid var(--color-divider)", padding: 0, width: "min(680px, calc(100vw - 32px))", maxHeight: "min(85vh, 760px)", background: "#fff", color: "var(--color-text)", margin: "auto" }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxHeight: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--color-divider)" }}>
            <h2 id={titleId} style={{ fontSize: 22, margin: 0 }}>{title}</h2>
            <button type="button" aria-label="Kapat" onClick={() => ref.current?.close()} className="btn btn-secondary" style={{ padding: 6, lineHeight: 0 }}>
              <X size={18} aria-hidden />
            </button>
          </div>
          <div style={{ overflowY: "auto", padding: 20, fontSize: 15, maxHeight: "calc(min(85vh, 760px) - 140px)" }}>{children}</div>
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-divider)", textAlign: "right" }}>
            <button type="button" className="btn btn-primary blueprint" onClick={() => ref.current?.close()}>Kapat</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

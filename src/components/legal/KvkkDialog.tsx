"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import { KvkkContent } from "./KvkkContent";

/** Metin bağlantısı + açılır pencere (native <dialog>: odak tuzağı, Esc ile kapanma, arka plan kilidi hazır gelir). */
export function KvkkDialog({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", textDecoration: "underline", color: "var(--color-accent-600)" }}>
        {children}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="kvkk-title"
        // Pencere, onay kutusunun <label>'ı içinde yer alır: içindeki tıklamalar kutuyu işaretlemesin.
        // Dışarıya (::backdrop) tıklayınca kapat.
        onClick={(e) => { e.preventDefault(); if (e.target === ref.current) ref.current?.close(); }}
        style={{ border: "1px solid var(--color-divider)", padding: 0, width: "min(680px, calc(100vw - 32px))", maxHeight: "min(85vh, 760px)", background: "#fff", color: "var(--color-text)", margin: "auto" }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxHeight: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--color-divider)" }}>
            <h2 id="kvkk-title" style={{ fontSize: 22, margin: 0 }}>KVKK Aydınlatma Metni</h2>
            <button type="button" aria-label="Kapat" onClick={() => ref.current?.close()} className="btn btn-secondary" style={{ padding: 6, lineHeight: 0 }}>
              <X size={18} aria-hidden />
            </button>
          </div>
          <div style={{ overflowY: "auto", padding: "20px", fontSize: 15, maxHeight: "calc(min(85vh, 760px) - 140px)" }}>
            <KvkkContent />
          </div>
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-divider)", textAlign: "right" }}>
            <button type="button" className="btn btn-primary blueprint" onClick={() => ref.current?.close()}>Kapat</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

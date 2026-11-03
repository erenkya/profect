"use client";

import { useEffect, useRef } from "react";

/**
 * "Hakkı yeni kişiye verilemez" uyarısı: izlenmiş bir eğitimin kontenjanı geri alınırken (ya da böyle bir üye çıkarılırken) çıkar.
 * `message` null ise kapalıdır. Yalnızca "Yine de geri al" onayı kontenjanı yakar.
 */
export function ReclaimDialog({ message, confirmLabel = "Yine de geri al", onCancel, onConfirm, busy }: { message: React.ReactNode | null; confirmLabel?: string; onCancel: () => void; onConfirm: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = message !== null;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="reclaim-title"
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
      style={{ border: "1px solid var(--color-accent-2-300)", padding: 0, width: "min(520px, calc(100vw - 32px))", background: "#fff", color: "var(--color-text)", margin: "auto" }}
    >
      <div style={{ padding: 20, display: "grid", gap: 14 }}>
        <h2 id="reclaim-title" style={{ fontSize: 22, margin: 0 }}>Bu hak yeni bir kişiye verilemez</h2>
        <div role="alert" style={{ fontSize: 15, padding: "10px 12px", border: "1px solid var(--color-accent-2-300)", background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}>{message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Vazgeç</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy} style={{ background: "var(--color-accent-2-700)", borderColor: "var(--color-accent-2-700)" }}>{busy ? "İşleniyor…" : confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

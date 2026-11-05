"use client";

import { useEffect, useRef } from "react";
import { RECLAIM_CONFIRM_LABEL, RECLAIM_TITLE, SUPPORT_EMAIL } from "@/lib/company-copy";

/** Metindeki destek e-postasını mailto bağlantısına çevirir (metin düz string gelirse). */
function withSupportLink(message: React.ReactNode): React.ReactNode {
  if (typeof message !== "string" || !message.includes(SUPPORT_EMAIL)) return message;
  const [before, ...rest] = message.split(SUPPORT_EMAIL);
  return <>{before}<a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "inherit", fontWeight: 700 }}>{SUPPORT_EMAIL}</a>{rest.join(SUPPORT_EMAIL)}</>;
}

/**
 * "Başlanmış eğitim geri alınamaz, yalnızca silinebilir" uyarısı: izlenmiş bir eğitimin (ya da programın) kontenjanı geri alınırken
 * ya da böyle bir üye şirketten çıkarılırken çıkar. `message` null ise kapalıdır. Yalnızca onay düğmesi kontenjanı yakar.
 */
export function ReclaimDialog({ message, confirmLabel = RECLAIM_CONFIRM_LABEL, onCancel, onConfirm, busy }: { message: React.ReactNode | null; confirmLabel?: string; onCancel: () => void; onConfirm: () => void; busy?: boolean }) {
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
        <h2 id="reclaim-title" style={{ fontSize: 22, margin: 0 }}>{RECLAIM_TITLE}</h2>
        <div role="alert" style={{ fontSize: 15, padding: "10px 12px", border: "1px solid var(--color-accent-2-300)", background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}>{withSupportLink(message)}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Vazgeç</button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy} style={{ background: "var(--color-accent-2-700)", borderColor: "var(--color-accent-2-700)" }}>{busy ? "İşleniyor…" : confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}

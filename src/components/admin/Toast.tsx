"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

type FlashInput = { kind: "ok" | "error"; text: string; details?: string[] };
export type Flash = (FlashInput & { id: number }) | null;

/** Bildirim durumu. Her çağrı yeni bir id alır; aynı mesaj art arda gelse de bildirim yeniden belirir. */
export function useFlash() {
  const [flash, set] = useState<Flash>(null);
  const seq = useRef(0);
  const setFlash = useCallback((f: FlashInput | null) => set(f && { ...f, id: ++seq.current }), []);
  return [flash, setFlash] as const;
}

/**
 * Ekranın üstünde sabit bildirim: sayfa nerede kaydırılmış olursa olsun görünür, yukarıdan kayarak gelir.
 * Başarı bildirimi birkaç saniye sonra kapanır; hata, kapatılana kadar kalır.
 */
export function Toast({ flash, onClose }: { flash: Flash; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!flash || flash.kind !== "ok") return;
    const t = setTimeout(() => close.current(), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  if (!flash) return null;
  const Icon = flash.kind === "ok" ? CircleCheck : CircleAlert;
  return (
    <div key={flash.id} className="toast" data-kind={flash.kind} role={flash.kind === "error" ? "alert" : "status"}>
      <Icon size={20} strokeWidth={1.75} className="toast-icon" aria-hidden />
      <div className="toast-body">
        <div>{flash.text}</div>
        {flash.details && <ul>{flash.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
      </div>
      <button type="button" className="toast-close" aria-label="Bildirimi kapat" onClick={onClose}><X size={16} strokeWidth={1.75} /></button>
    </div>
  );
}

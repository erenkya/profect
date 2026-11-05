"use client";

import { useState } from "react";
import { Send } from "lucide-react";

const STATUS_STYLE = { fontSize: 13, textAlign: "center", color: "var(--muted-72)" } as const;

/** Şirkete bağlı üyenin kurs sayfasındaki eylemi: şirket yöneticisinden eğitimi talep eder (kendi satın alması da açıktır). */
export function RequestCourseButton({ courseId, className = "btn btn-primary btn-block", style }: { courseId: number; className?: string; style?: React.CSSProperties }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function send() {
    setState("sending");
    try {
      const res = await fetch("/api/company/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ course_id: courseId }) });
      const json = await res.json().catch(() => ({}));
      // Açık talep zaten varsa (409) kullanıcı için sonuç aynı: talebi iletilmiş durumda.
      if (res.ok || (res.status === 409 && /açık bir talebiniz/.test(json.message ?? ""))) {
        setState("sent");
        setMessage("Talebiniz şirket yöneticinize iletildi.");
      } else {
        setState("error");
        setMessage(json.message ?? "Talep gönderilemedi.");
      }
    } catch {
      setState("error");
      setMessage("Bağlantı hatası. Lütfen tekrar deneyin.");
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button type="button" className={className} style={style} onClick={send} disabled={state === "sending" || state === "sent"}>
        <Send size={15} aria-hidden /> {state === "sent" ? "Talep gönderildi" : state === "sending" ? "Gönderiliyor…" : "Şirketimden talep et"}
      </button>
      {message && <div role={state === "error" ? "alert" : "status"} style={{ ...STATUS_STYLE, color: state === "error" ? "var(--color-accent-2-800)" : STATUS_STYLE.color }}>{message}</div>}
    </div>
  );
}

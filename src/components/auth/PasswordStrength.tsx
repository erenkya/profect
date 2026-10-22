"use client";

import { Check, Circle } from "lucide-react";
import { evaluatePassword } from "@/lib/password-strength";

const COLORS = ["#b3261e", "#c2591a", "#a8800b", "#3f8a4f", "#1f7a3a"] as const;

const HIDDEN = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" } as const;

/** Şifre güç çubuğu + kural kontrol listesi. Boş şifrede yalnızca kurallar (nötr) görünür. */
export function PasswordStrength({ password, userInputs = [] }: { password: string; userInputs?: readonly string[] }) {
  const ev = evaluatePassword(password, userInputs);
  const color = COLORS[ev.score];
  const started = password.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div role="meter" aria-label="Şifre gücü" aria-valuemin={0} aria-valuemax={4} aria-valuenow={started ? ev.score : 0} aria-valuetext={ev.label || "Boş"} style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ height: 6, background: started && i < Math.max(ev.score, 1) ? color : "var(--color-accent-300)", opacity: started && i < Math.max(ev.score, 1) ? 1 : 0.5, transition: "background .2s" }} />
          ))}
        </div>
        <span aria-live="polite" style={{ fontSize: 13, fontWeight: 600, minWidth: 74, textAlign: "right", color: started ? color : "var(--muted-72)" }}>{started ? ev.label : "—"}</span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "2px 12px", fontSize: 13 }}>
        {ev.rules.map((r) => (
          <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, color: r.ok ? "#1f7a3a" : "var(--muted-72)" }}>
            {r.ok ? <Check size={14} aria-hidden /> : <Circle size={8} aria-hidden style={{ margin: "0 3px" }} />}
            <span>{r.label}<span style={HIDDEN}>{r.ok ? " (sağlandı)" : " (sağlanmadı)"}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

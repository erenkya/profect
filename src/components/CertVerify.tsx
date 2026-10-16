"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Corners } from "./Corners";
import { formatDate } from "@/lib/format";

type Found = { student_name: string; course_title: string; issued_at: string };
type Result = { kind: "ok"; cert: Found } | { kind: "bad"; message: string } | null;

export function CertVerify() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    const code = query.trim();
    if (!code) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/public/certificates/${encodeURIComponent(code)}`);
      const json = await res.json();
      setResult(res.ok ? { kind: "ok", cert: json.data } : { kind: "bad", message: json.message ?? "Doğrulanamadı." });
    } catch {
      setResult({ kind: "bad", message: "Bağlantı hatası. Lütfen tekrar deneyin." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form
        className="field"
        style={{ maxWidth: 460 }}
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
      >
        <label htmlFor="cert-no">Sertifika numarası</label>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            id="cert-no"
            className="input"
            placeholder="PRF-2026-000000"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setResult(null);
            }}
            style={{ background: "#ffffff", fontSize: 16, minHeight: 46 }}
          />
          <button type="submit" disabled={busy || !query.trim()} className="btn btn-primary blueprint" style={{ fontSize: 16, padding: "0 22px", minHeight: 46 }}>
            <Corners />
            {busy ? "…" : "Doğrula"}
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {result?.kind === "ok" && (
          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", fontSize: 15, color: "var(--color-accent-700)" }}>
            <Check size={18} strokeWidth={1.5} style={{ flex: "none" }} />
            Geçerli sertifika · {result.cert.student_name} · {result.cert.course_title} · {formatDate(result.cert.issued_at)}
          </div>
        )}
        {result?.kind === "bad" && <div style={{ marginTop: 16, fontSize: 15, color: "var(--color-accent-2-700)" }}>{result.message}</div>}
      </div>
    </>
  );
}

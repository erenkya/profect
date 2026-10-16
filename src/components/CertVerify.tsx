"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Corners } from "./Corners";
import { DEMO_CERT } from "@/data/courses";

type Result = "ok" | "bad" | null;

export function CertVerify() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result>(null);

  const verify = () => {
    const q = query.trim();
    // Demo: yalnızca örnek sertifika numarası geçerli; boş bırakılırsa örnek doldurulur.
    const ok = q === "" || /PRF-?2026-?08431/i.test(q);
    setQuery(q || DEMO_CERT.number);
    setResult(ok ? "ok" : "bad");
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
            placeholder={DEMO_CERT.number}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setResult(null);
            }}
            style={{ background: "#ffffff", fontSize: 16, minHeight: 46 }}
          />
          <button type="submit" className="btn btn-primary blueprint" style={{ fontSize: 16, padding: "0 22px", minHeight: 46 }}>
            <Corners />
            Doğrula
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {result === "ok" && (
          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", fontSize: 15, color: "var(--color-accent-700)" }}>
            <Check size={18} strokeWidth={1.5} />
            Geçerli sertifika · {DEMO_CERT.holder} · {DEMO_CERT.course} · {DEMO_CERT.date}
          </div>
        )}
        {result === "bad" && (
          <div style={{ marginTop: 16, fontSize: 15, color: "var(--color-accent-2-700)" }}>
            Bu numarayla kayıtlı bir sertifika bulunamadı.
          </div>
        )}
      </div>
    </>
  );
}

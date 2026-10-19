"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Corners } from "./Corners";
import { extractCertCode } from "@/lib/format";

/** Sertifika bulunursa sertifikanın kendisini gösteren sayfaya gider; bulunamazsa hatayı burada gösterir. */
export function CertVerify() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    const code = extractCertCode(query);
    if (!code) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/public/certificates/${encodeURIComponent(code)}`);
      const json = await res.json();
      if (res.ok) {
        // Yönlendirme sürerken buton pasif kalsın diye busy'yi burada kapatmıyoruz.
        router.push(`/sertifika/${encodeURIComponent(json.data.certificate_code)}`);
        return;
      }
      setError(json.message ?? "Doğrulanamadı.");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    }
    setBusy(false);
  };

  return (
    <>
      <form
        className="field"
        style={{ maxWidth: 520 }}
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
      >
        <label htmlFor="cert-no">Sertifika numarası veya linki</label>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            id="cert-no"
            className="input"
            placeholder="PRF-2026-000000 veya sertifika linki"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setError("");
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
        {error && <div style={{ marginTop: 16, fontSize: 15, color: "var(--color-accent-2-700)" }}>{error}</div>}
      </div>
    </>
  );
}

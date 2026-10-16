"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Corners } from "@/components/Corners";

export function CertificateButton({ courseId, label = "Sertifikamı Al" }: { courseId: number; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/client/certificates/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course_id: courseId }),
      });
      const json = await res.json();
      if (res.ok) router.push(`/sertifika/${json.certificate_code}`);
      else setError(json.message ?? "Sertifika oluşturulamadı.");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn btn-primary blueprint" onClick={generate} disabled={busy} style={{ fontSize: 17, padding: "12px 24px" }}>
        <Corners />
        {busy ? "Oluşturuluyor…" : label}
      </button>
      {error && <div role="alert" style={{ marginTop: 8, fontSize: 14, color: "var(--color-accent-2-700)" }}>{error}</div>}
    </div>
  );
}

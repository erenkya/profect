"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Tüm kursları zaten edinilmiş kullanıcının programa ücretsiz katılması (POST /api/programs/join; sipariş açılmaz).
 * Uygunluk sunucuda doğrulanır; buton yalnızca gösterim kararıdır. `onJoined` sepet gibi istemci durumunu temizlemek içindir.
 */
export function JoinProgramButton({ slug, onJoined }: { slug: string; onJoined?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/programs/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
      const json = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
      if (!res.ok || !json?.success) {
        setError(json?.message ?? "Programa katılınamadı. Lütfen tekrar dene.");
        setBusy(false);
        return;
      }
      router.refresh();
      onJoined?.();
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar dene.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-primary" onClick={join} disabled={busy} aria-busy={busy}>
        {busy ? "Katılıyorsun…" : "Programa ücretsiz katıl"}
      </button>
      {error && <p role="alert" className="cart-note" style={{ margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}

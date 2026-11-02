"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Corners } from "@/components/Corners";
import { FormMessage } from "@/components/auth/AuthShell";

/** "Hediyeyi Al": alma yalnızca POST ile yapılır (GET durum değiştirmez). Başarıda kursun ya da programın sayfasına yönlenir. */
export function ClaimGiftButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function claim() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/gifts/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const json = await res.json();
      if (res.ok) {
        router.push(json.kind === "program" ? `/programlar/${json.slug}` : `/ogrenim/${json.slug}`);
        router.refresh();
        return;
      }
      setError(json.message ?? "Hediye alınamadı.");
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <FormMessage kind="error">{error}</FormMessage>}
      <button type="button" onClick={claim} disabled={busy} className="btn btn-primary blueprint" style={{ fontSize: 17, padding: 13 }}>
        <Corners />
        {busy ? "Ekleniyor…" : "Hediyeyi Al"}
      </button>
    </>
  );
}

/** Yanlış hesapla açılan hediye sayfasında: çıkış yapıp doğru hesapla giriş ekranına döner. */
export function SwitchAccountButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchAccount() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push(`/giris?next=${encodeURIComponent(`/hediye/${token}`)}`);
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={switchAccount} disabled={busy} className="btn btn-secondary">
      {busy ? "Çıkış yapılıyor…" : "Çıkış yap ve doğru hesapla gir"}
    </button>
  );
}

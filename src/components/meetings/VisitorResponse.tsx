"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormMessage } from "@/components/auth/AuthShell";
import type { MeetingRow } from "@/lib/meetings";
import { patchMeeting } from "./patch-meeting";

/** Ziyaretçi: öneriyi kabul/ret, bekleyen talebi iptal. */
export function VisitorResponse({ token, status }: { token: string; status: MeetingRow["status"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(action: "visitor_accept" | "visitor_decline" | "cancel") {
    setBusy(true); setError("");
    const r = await patchMeeting(token, { action });
    setBusy(false);
    if (r.ok) router.refresh(); else setError(r.message);
  }
  if (status !== "pending" && status !== "counter_proposed") return null;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {status === "counter_proposed" && (<>
          <button className="btn btn-primary" disabled={busy} onClick={() => act("visitor_accept")}>Öneriyi Kabul Et</button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => act("visitor_decline")}>Öneriyi Reddet</button>
        </>)}
        <button className="btn btn-secondary" disabled={busy} onClick={() => { if (confirm("Talebi iptal etmek istediğinize emin misiniz?")) act("cancel"); }}>Talebi İptal Et</button>
      </div>
      {error && <FormMessage kind="error">{error}</FormMessage>}
    </div>
  );
}

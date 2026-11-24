export async function patchMeeting(token: string, body: { action: string; startsAt?: string; meetingUrl?: string; note?: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/gorusme/${token}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    return res.ok && j?.success ? { ok: true } : { ok: false, message: j?.message ?? "İşlem yapılamadı." };
  } catch {
    return { ok: false, message: "Bağlantı hatası. Lütfen tekrar deneyin." };
  }
}

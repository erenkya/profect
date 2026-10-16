/** Yönetici arayüzü için küçük fetch yardımcısı. */
export async function adminApi(method: "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown): Promise<{ ok: boolean; message: string; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, message: (json.message as string) ?? (res.ok ? "Kaydedildi." : "İşlem başarısız."), json };
  } catch {
    return { ok: false, message: "Bağlantı hatası.", json: {} };
  }
}

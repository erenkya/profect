import { after } from "next/server";
import { fail, getBaseUrl, ok, parseBody, serverError } from "@/lib/http";
import { getCurrentUser } from "@/lib/auth";
import { verifyTurnstile } from "@/lib/turnstile";
import { createMeetingRequest } from "@/lib/meetings";
import { requestSchema } from "@/lib/meeting-schemas";
import { notifyMeeting } from "@/lib/meeting-notify";

// Basit bellek içi IP sınırı (≤5 talep / 10 dk). Sunucusuz ortamda örnek başınadır; e-posta günlük sınırı DB'de kesin uygulanır.
const hits = new Map<string, number[]>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 600_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 5;
}

/** Ziyaretçi görüşme talebi. Giriş gerekmez; girişliyse user_id bağlanır. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (tooMany(ip)) return fail("Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.", 429);
  const body = await parseBody(request, requestSchema);
  if (body.error) return body.error;
  const bot = await verifyTurnstile(body.data.turnstileToken);
  if (!bot.ok) return fail(bot.message, bot.status);
  try {
    const user = await getCurrentUser();
    const { turnstileToken: _t, ...input } = body.data;
    const r = await createMeetingRequest({ ...input, userId: user?.id ?? null });
    if ("error" in r) {
      return r.error === "rate_limited"
        ? fail("Bu e-posta ile bugün çok fazla talep oluşturuldu. Lütfen yarın tekrar deneyin.", 429)
        : fail("Seçtiğiniz saat artık uygun değil. Lütfen başka bir saat seçin.", 409);
    }
    const base = getBaseUrl(request);
    after(() => notifyMeeting("requested", r.id, base));
    return ok({ id: r.id });
  } catch (err) {
    return serverError("[POST /api/gorusme]", err);
  }
}

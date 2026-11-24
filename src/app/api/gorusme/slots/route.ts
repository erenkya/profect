import { fail, ok, serverError } from "@/lib/http";
import { isExpertId } from "@/data/experts";
import { listAvailableDays, listSlotsForDay } from "@/lib/meetings";

/** GET ?expert&duration → { days } · ?expert&duration&day=YYYY-MM-DD → { slots } (boş saatler, İstanbul saati). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const expert = q.get("expert");
  const duration = Number(q.get("duration"));
  const day = q.get("day");
  if (!isExpertId(expert)) return fail("Geçersiz uzman.", 400);
  if (duration !== 15 && duration !== 30) return fail("Süre 15 ya da 30 dakika olmalı.", 400);
  try {
    if (day === null) return ok({ days: await listAvailableDays(expert, duration) });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail("Geçersiz gün.", 400);
    return ok({ slots: await listSlotsForDay(expert, duration, day) });
  } catch (err) {
    return serverError("[GET /api/gorusme/slots]", err);
  }
}

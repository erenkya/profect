import { after } from "next/server";
import { fail, getBaseUrl, ok, parseBody, serverError } from "@/lib/http";
import { applyMeetingAction, getMeetingByToken } from "@/lib/meetings";
import { respondSchema } from "@/lib/meeting-schemas";
import { notifyEventFor, notifyMeeting } from "@/lib/meeting-notify";
import type { MeetingAction } from "@/lib/meeting-rules";

const ALLOWED: Record<"expert" | "visitor", MeetingAction[]> = {
  expert: ["accept", "decline", "counter", "set_link"],
  visitor: ["visitor_accept", "visitor_decline", "cancel"],
};
const STATUS = { not_found: 404, invalid_transition: 409, slot_conflict: 409, slot_invalid: 409, link_required: 400, time_required: 400 } as const;
const MESSAGE = {
  not_found: "Görüşme bulunamadı.",
  invalid_transition: "Bu işlem görüşmenin şu anki durumuna uygun değil.",
  slot_conflict: "Bu saat artık dolu. Lütfen başka bir saat önerin.",
  slot_invalid: "Seçilen saat müsait değil.",
  link_required: "Toplantı bağlantısı gerekli.",
  time_required: "Önerilecek saati seçin.",
} as const;

/** Uzman (yanıt linki) ya da ziyaretçi (talep linki) tokenıyla görüşme aksiyonu. Rol token'dan çıkar. */
export async function PATCH(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await parseBody(request, respondSchema);
  if (body.error) return body.error;
  try {
    const found = await getMeetingByToken(token);
    if (!found) return fail("Bağlantı geçersiz ya da süresi dolmuş.", 410);
    const { action, startsAt, meetingUrl, note } = body.data;
    if (!ALLOWED[found.role].includes(action)) return fail("Bu bağlantıyla bu işlem yapılamaz.", 403);
    const r = await applyMeetingAction({ id: found.meeting.id, action, actor: found.role, startsAt, meetingUrl, note });
    if (!r.ok) return fail(MESSAGE[r.reason], STATUS[r.reason]);
    const base = getBaseUrl(request);
    const event = notifyEventFor(action, found.role);
    after(() => notifyMeeting(event, r.meeting.id, base));
    return ok({ status: r.meeting.status });
  } catch (err) {
    return serverError("[PATCH /api/gorusme/:token]", err);
  }
}

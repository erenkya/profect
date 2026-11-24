import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fail, getBaseUrl, ok, parseBody, parseId, serverError } from "@/lib/http";
import { applyMeetingAction, updateMeetingDetails, type ActionResult } from "@/lib/meetings";
import { adminActionSchema } from "@/lib/meeting-schemas";
import { notifyEventFor, notifyMeeting } from "@/lib/meeting-notify";

const STATUS = { not_found: 404, invalid_transition: 409, slot_conflict: 409, slot_invalid: 409, link_required: 400, time_required: 400 } as const;
const MESSAGE = {
  not_found: "Görüşme bulunamadı.",
  invalid_transition: "Bu işlem görüşmenin şu anki durumuna uygun değil.",
  slot_conflict: "Bu saat başka bir onaylı görüşmeyle çakışıyor.",
  slot_invalid: "Seçilen saat müsait değil.",
  link_required: "Toplantı bağlantısı gerekli.",
  time_required: "Saat seçin.",
} as const;

/** Admin: kabul/ret/öneri/link/iptal ve onaylı görüşmenin saat+link güncellemesi. Her değişiklik ziyaretçiye mail olarak gider. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Geçersiz görüşme.", 400);
  const body = await parseBody(request, adminActionSchema);
  if (body.error) return body.error;
  const { action, startsAt, meetingUrl, note } = body.data;
  try {
    let r: ActionResult;
    if (action === "update") {
      if (!startsAt && !meetingUrl) return fail("Yeni saat ya da bağlantı gerekli.", 400);
      r = await updateMeetingDetails(id, { startsAt, meetingUrl }, guard.payload.userId);
    } else {
      r = await applyMeetingAction({ id, action, actor: "admin", actorId: guard.payload.userId, startsAt, meetingUrl, note });
    }
    if (!r.ok) return fail(MESSAGE[r.reason], STATUS[r.reason]);
    const base = getBaseUrl(request);
    const event = action === "update" ? "updated" : notifyEventFor(action, "admin");
    after(() => notifyMeeting(event, id, base));
    return ok({ status: r.meeting.status });
  } catch (err) {
    return serverError("[PATCH /api/admin/meetings/:id]", err);
  }
}

import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { ASSIGN_BLOCK_MESSAGES } from "@/lib/company-rules";
import { resolveCourseRequest } from "@/lib/company-seats";

/** { action: "assign" | "reject" }: üyenin eğitim talebini kontenjandan atayarak karşılar ya da reddeder. */
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; requestId: string }> }) {
  const p = await params;
  const companyId = parseId(p.companyId);
  const requestId = parseId(p.requestId);
  if (!companyId || !requestId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ action: z.enum(["assign", "reject"]) }));
  if (body.error) return body.error;
  try {
    const r = await resolveCourseRequest({ companyId, requestId, action: body.data.action, actorId: guard.payload.userId });
    if (r.ok) return ok({ message: body.data.action === "assign" ? "Eğitim atandı." : "Talep reddedildi." });
    if (r.reason === "not_found") return fail("Talep bulunamadı.", 404);
    if (r.reason === "bad_state") return fail("Bu talep zaten sonuçlandırılmış.", 409);
    return Response.json({ success: false, reason: r.reason, message: ASSIGN_BLOCK_MESSAGES[r.reason] }, { status: 409 });
  } catch (err) {
    return serverError("[POST /api/company/:id/requests/:id]", err);
  }
}

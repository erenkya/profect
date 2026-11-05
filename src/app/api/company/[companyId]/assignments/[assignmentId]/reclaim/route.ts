import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { reclaimSeat } from "@/lib/company-seats";
import { startedReclaimText } from "@/lib/company-copy";

/**
 * Atanmış kontenjanı geri alır. İzlenmiş eğitimde `confirm_burn` yoksa 409 `needs_confirm` döner (hiçbir şey değişmez);
 * `confirm_burn: true` ile erişim kapanır ve kontenjan yanar. İzlenmemişse kontenjan havuza döner.
 */
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string; assignmentId: string }> }) {
  const p = await params;
  const companyId = parseId(p.companyId);
  const assignmentId = parseId(p.assignmentId);
  if (!companyId || !assignmentId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ confirm_burn: z.boolean().optional() }));
  if (body.error) return body.error;
  try {
    const r = await reclaimSeat({ companyId, assignmentId, confirmBurn: body.data.confirm_burn === true });
    if (r.ok) return ok({ outcome: r.outcome, message: r.outcome === "burn" ? "Erişim kapatıldı; kontenjan yanmış sayıldı." : "Kontenjan geri alındı." });
    if (r.reason === "not_found") return fail("Atama bulunamadı.", 404);
    return Response.json(
      { success: false, reason: "needs_confirm", courseTitle: r.courseTitle, userName: r.userName, message: startedReclaimText({ name: r.userName ?? "Çalışan", titles: [r.courseTitle ?? "bu eğitim"] }) },
      { status: 409 },
    );
  } catch (err) {
    return serverError("[POST /api/company/:id/assignments/:id/reclaim]", err);
  }
}

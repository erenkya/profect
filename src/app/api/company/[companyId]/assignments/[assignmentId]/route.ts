import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { setAssignmentDue } from "@/lib/company-seats";
import { DUE_PAST_MESSAGE, dueBlock, dueInputSchema } from "@/lib/due-rules";

/**
 * Çalışana özel son tarihi değiştirir. `due_at` Türkiye saatiyle "2026-11-05T14:30" biçimindedir; null ya da boş süreyi kaldırır.
 * Süre geçmiş bir tarihe çekilemez; çalışanın erişimi kapandıysa ileri bir tarih vermek erişimi yeniden açar.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; assignmentId: string }> }) {
  const p = await params;
  const companyId = parseId(p.companyId);
  const assignmentId = parseId(p.assignmentId);
  if (!companyId || !assignmentId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ due_at: dueInputSchema }));
  if (body.error) return body.error;
  if (body.data.due_at && dueBlock(body.data.due_at, Date.now())) return fail(DUE_PAST_MESSAGE, 400);
  try {
    const updated = await setAssignmentDue({ companyId, assignmentId, dueAt: body.data.due_at });
    return updated ? ok({ message: body.data.due_at ? "Son tarih güncellendi." : "Son tarih kaldırıldı." }) : fail("Atama bulunamadı.", 404);
  } catch (err) {
    return serverError("[PATCH /api/company/:id/assignments/:id]", err);
  }
}

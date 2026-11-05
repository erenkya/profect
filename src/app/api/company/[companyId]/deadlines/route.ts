import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { setCourseDeadline } from "@/lib/company-seats";
import { DUE_PAST_MESSAGE, dueBlock, dueInputSchema } from "@/lib/due-rules";

/**
 * Bir eğitime, o eğitimi şirket kontenjanıyla alan herkes için geçerli son tarih koyar. `due_at` Türkiye saatiyle
 * "2026-11-05T14:30" biçimindedir; null ya da boş süreyi kaldırır. Çalışana özel süre varsa ikisinden erken olan geçerlidir.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ course_id: z.number().int().positive(), due_at: dueInputSchema }));
  if (body.error) return body.error;
  if (body.data.due_at && dueBlock(body.data.due_at, Date.now())) return fail(DUE_PAST_MESSAGE, 400);
  try {
    const saved = await setCourseDeadline({ companyId, courseId: body.data.course_id, dueAt: body.data.due_at, actorId: guard.payload.userId });
    if (!saved) return fail("Bu eğitim için şirketin kontenjanı yok.", 404);
    return ok({ message: body.data.due_at ? "Eğitim son tarihi güncellendi." : "Eğitim son tarihi kaldırıldı." });
  } catch (err) {
    return serverError("[PUT /api/company/:id/deadlines]", err);
  }
}

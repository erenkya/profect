import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { applyBulkAssignments, bulkFailureMessage } from "@/lib/company-bulk-assign";
import { DUE_PAST_MESSAGE, dueBlock, dueInputSchema } from "@/lib/due-rules";
import { BULK_MAX_ITEMS, summarizeBulk, type BulkItem } from "@/lib/program-seat-rules";

const itemSchema = z
  .object({ user_id: z.number().int().positive(), course_id: z.number().int().positive().optional(), program_id: z.number().int().positive().optional() })
  .refine((v) => (v.course_id === undefined) !== (v.program_id === undefined), { message: "Her kutucukta course_id ya da program_id verin (ikisi birden olamaz)." });

/**
 * Çalışan × eğitim/program kutucuklarını tek istekte atar (şirket admini ya da ana admin). Kısmi başarı normaldir: yanıt `assigned` sayısını ve
 * başarısız kutucukları (`reason` + Türkçe `message`) döner. `due_at` (Türkiye saati) yalnızca kurs atamalarına uygulanır.
 * Şirket üyeliği her kutucukta sunucuda doğrulanır; başka şirketin kullanıcısı `not_member` olur.
 */
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ items: z.array(itemSchema).min(1, "En az bir atama seçin.").max(BULK_MAX_ITEMS, `Tek seferde en fazla ${BULK_MAX_ITEMS} atama yapılabilir.`), due_at: dueInputSchema.optional() }));
  if (body.error) return body.error;
  const dueAt = body.data.due_at ?? null;
  if (dueAt && dueBlock(dueAt, Date.now())) return fail(DUE_PAST_MESSAGE, 400);
  try {
    const items: BulkItem[] = body.data.items.map((it) => (it.program_id !== undefined ? { userId: it.user_id, programId: it.program_id } : { userId: it.user_id, courseId: it.course_id! }));
    const { assigned, failures } = summarizeBulk(await applyBulkAssignments({ companyId, actorId: guard.payload.userId, items, dueAt }));
    return ok({
      assigned,
      failed: failures.map((f) => ({
        user_id: f.item.userId,
        ...(f.item.programId !== undefined ? { program_id: f.item.programId } : { course_id: f.item.courseId }),
        reason: f.reason,
        message: bulkFailureMessage(f.item, f.reason),
      })),
    });
  } catch (err) {
    return serverError("[POST /api/company/:id/assignments/bulk]", err);
  }
}

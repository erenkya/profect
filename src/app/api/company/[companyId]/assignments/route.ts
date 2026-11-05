import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { assignSeat } from "@/lib/company-seats";
import { ASSIGN_BLOCK_MESSAGES } from "@/lib/company-rules";
import { DUE_PAST_MESSAGE, dueBlock, dueInputSchema } from "@/lib/due-rules";


/** Kontenjandan üyeye eğitim atar; `due_at` (Türkiye saati) verilirse çalışana özel son tarih konur. Şirket admini kendine de atayabilir. */
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ user_id: z.number().int().positive(), course_id: z.number().int().positive(), due_at: dueInputSchema.optional() }));
  if (body.error) return body.error;
  const dueAt = body.data.due_at ?? null;
  if (dueAt && dueBlock(dueAt, Date.now())) return fail(DUE_PAST_MESSAGE, 400);
  try {
    const r = await assignSeat({ companyId, courseId: body.data.course_id, userId: body.data.user_id, assignedBy: guard.payload.userId, dueAt });
    return r.ok ? ok({ message: "Eğitim atandı." }) : Response.json({ success: false, reason: r.reason, message: ASSIGN_BLOCK_MESSAGES[r.reason] }, { status: 409 });
  } catch (err) {
    return serverError("[POST /api/company/:id/assignments]", err);
  }
}

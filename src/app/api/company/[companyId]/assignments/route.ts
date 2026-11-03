import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { assignSeat } from "@/lib/company-seats";
import { ASSIGN_BLOCK_MESSAGES } from "@/lib/company-rules";


/** Kontenjandan üyeye eğitim atar. Şirket admini kendine de atayabilir. */
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ user_id: z.number().int().positive(), course_id: z.number().int().positive() }));
  if (body.error) return body.error;
  try {
    const r = await assignSeat({ companyId, courseId: body.data.course_id, userId: body.data.user_id, assignedBy: guard.payload.userId });
    return r.ok ? ok({ message: "Eğitim atandı." }) : Response.json({ success: false, reason: r.reason, message: ASSIGN_BLOCK_MESSAGES[r.reason] }, { status: 409 });
  } catch (err) {
    return serverError("[POST /api/company/:id/assignments]", err);
  }
}

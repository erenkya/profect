import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { resolveMember } from "@/lib/company";

/** { action: "approve" | "reject" | "promote" | "demote" }: şirket admini kendi şirketinde, ana admin her şirkette. */
export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string; memberId: string }> }) {
  const p = await params;
  const companyId = parseId(p.companyId);
  const memberId = parseId(p.memberId);
  if (!companyId || !memberId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ action: z.enum(["approve", "reject", "promote", "demote"]) }));
  if (body.error) return body.error;
  try {
    const r = await resolveMember(companyId, memberId, body.data.action, guard.payload.userId);
    if (r.ok) return ok({ message: "Güncellendi." });
    if (r.reason === "not_found") return fail("Üye bulunamadı.", 404);
    if (r.reason === "last_admin") return fail("Şirketin son yöneticisi yöneticilikten çıkarılamaz.", 409);
    return fail("Bu işlem üyenin mevcut durumunda yapılamaz.", 409);
  } catch (err) {
    return serverError("[PATCH /api/company/:id/members/:id]", err);
  }
}

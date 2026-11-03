import { fail, ok, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { listCompanyProgress } from "@/lib/company-seats";

/** Şirketin atadığı eğitimlerde çalışan durumu (ilerleme, durum, sertifika). */
export async function GET(_request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  try {
    return ok({ data: await listCompanyProgress(companyId) });
  } catch (err) {
    return serverError("[GET /api/company/:id/progress]", err);
  }
}

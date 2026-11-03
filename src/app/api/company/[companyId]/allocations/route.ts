import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { addAllocation } from "@/lib/company-seats";

const schema = z.object({
  course_id: z.number().int().positive(),
  /** Pozitif: kontenjan ekler; negatif: azaltır (atanan + yanan sayının altına inemez). */
  delta: z.number().int().min(-100000).max(100000),
});

/** Ana admin özel anlaşma kontenjanı tanımlar (ödeme sitede alınmaz). Şirket admini kendi kontenjanını tanımlayamaz. */
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  if (guard.actor !== "platform") return fail("Kontenjan tanımlamak için yönetici yetkisi gerekir.", 403);
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const r = await addAllocation({ companyId, courseId: body.data.course_id, delta: body.data.delta, source: "admin", createdBy: guard.payload.userId });
    if (r.ok) return ok({ message: "Kontenjan güncellendi." });
    if (r.reason === "below_used") return fail("Toplam kontenjan, atanan ve yanan kontenjanın altına düşürülemez.", 409);
    if (r.reason === "zero") return fail("Değişim miktarı 0 olamaz.", 400);
    return fail("Kurs bulunamadı.", 400);
  } catch (err) {
    return serverError("[POST /api/company/:id/allocations]", err);
  }
}

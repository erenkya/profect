import { z } from "zod";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { requireCompanyAccess } from "@/lib/company-guard";
import { addAllocation } from "@/lib/company-seats";
import { addProgramAllocation } from "@/lib/company-program-seats";

const schema = z
  .object({
    /** Tam biri: kurs ya da program kontenjanı. */
    course_id: z.number().int().positive().optional(),
    program_id: z.number().int().positive().optional(),
    /** Pozitif: kontenjan ekler; negatif: azaltır (atanan + yanan sayının altına inemez). */
    delta: z.number().int().min(-100000).max(100000),
  })
  .refine((v) => (v.course_id === undefined) !== (v.program_id === undefined), { message: "course_id ya da program_id verin (ikisi birden olamaz).", path: ["course_id"] });

/** Ana admin özel anlaşma kontenjanı tanımlar (kurs ya da program) (ödeme sitede alınmaz). Şirket admini kendi kontenjanını tanımlayamaz. */
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireCompanyAccess(companyId);
  if (guard.error) return guard.error;
  if (guard.actor !== "platform") return fail("Kontenjan tanımlamak için yönetici yetkisi gerekir.", 403);
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    if (body.data.program_id !== undefined) {
      const pr = await addProgramAllocation({ companyId, programId: body.data.program_id, delta: body.data.delta, source: "admin", createdBy: guard.payload.userId });
      if (pr.ok) return ok({ message: "Kontenjan güncellendi." });
      if (pr.reason === "below_used") return fail("Toplam kontenjan, atanan ve yanan kontenjanın altına düşürülemez.", 409);
      if (pr.reason === "zero") return fail("Değişim miktarı 0 olamaz.", 400);
      return fail("Program bulunamadı.", 400);
    }
    const r = await addAllocation({ companyId, courseId: body.data.course_id!, delta: body.data.delta, source: "admin", createdBy: guard.payload.userId });
    if (r.ok) return ok({ message: "Kontenjan güncellendi." });
    if (r.reason === "below_used") return fail("Toplam kontenjan, atanan ve yanan kontenjanın altına düşürülemez.", 409);
    if (r.reason === "zero") return fail("Değişim miktarı 0 olamaz.", 400);
    return fail("Kurs bulunamadı.", 400);
  } catch (err) {
    return serverError("[POST /api/company/:id/allocations]", err);
  }
}

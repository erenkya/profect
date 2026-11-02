import { z } from "zod";
import { requireUser } from "@/lib/auth";
import pool from "@/lib/db";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { enrollInProgram, ensureProgramProgress, getProgramOffer } from "@/lib/programs";

/**
 * Tüm kursları zaten edinilmiş (Plus kaynaklı kayıtlar sayılmaz) kullanıcının programa ücretsiz katılması.
 * Para hareketi olmadığından sipariş/fatura yazılmaz. Sahiplik ve uygunluk yalnızca sunucuda hesaplanır; istemciden yalnızca slug gelir.
 */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ slug: z.string().min(1).max(120) }));
  if (body.error) return body.error;
  const userId = guard.payload.userId;

  try {
    const offer = await getProgramOffer(body.data.slug, userId);
    if (!offer || !offer.program.is_published) return fail("Program bulunamadı.", 404);
    if (!offer.sellable) return fail("Bu program şu an katılıma açık değil.", 409);
    if (offer.member) return fail("Bu programa zaten üyesin.", 409);
    if (offer.calc.payable !== 0) return fail("Ücretsiz katılım için programdaki tüm kurslara sahip olmalısın.", 409);

    await enrollInProgram(pool, userId, offer.program.id, "auto");
    await ensureProgramProgress(userId, { programId: offer.program.id }); // kurslar zaten bitmişse program sertifikası da verilir
    return ok({ slug: offer.program.slug });
  } catch (err) {
    return serverError("[POST /api/programs/join]", err);
  }
}

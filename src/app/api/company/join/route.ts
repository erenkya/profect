import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { isCompanyCode, normalizeCompanyCode } from "@/lib/company-rules";
import { findCompanyByCode, requestJoin } from "@/lib/company";

/** Giriş yapmış kullanıcının şirket koduyla katılma isteği: üyelik "onay bekliyor" olarak açılır. */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ code: z.string().max(40) }));
  if (body.error) return body.error;
  try {
    const code = normalizeCompanyCode(body.data.code);
    const company = isCompanyCode(code) ? await findCompanyByCode(code) : null;
    if (!company) return fail("Şirket kodu geçersiz.", 400);
    const r = await requestJoin(guard.payload.userId, company.id);
    if (r === "already_member") return fail("Zaten bir şirkete bağlısınız ya da onay bekleyen bir isteğiniz var.", 409);
    if (r === "inactive_company") return fail("Şirket kodu geçersiz.", 400);
    return ok({ message: `${company.name} şirketine katılma isteğiniz alındı. Şirket yöneticisinin onayından sonra bağlanırsınız.` });
  } catch (err) {
    return serverError("[POST /api/company/join]", err);
  }
}

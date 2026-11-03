import { z } from "zod";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { emailDomain, isPublicDomain } from "@/lib/company-rules";
import { findCompanyByDomain } from "@/lib/company";
import { emailSchema } from "@/lib/validation";

/**
 * Kayıt formunun "X şirketine bağlı mısınız?" onay kutusu için: e-postanın uzantısı bir şirketinkiyle eşleşiyorsa adı ve kodu döner.
 * Giriş gerektirmez. Kod yine de katılım onayı olmadan hiçbir şey açmaz; genel posta uzantıları hiçbir zaman eşleşmez.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, z.object({ email: emailSchema }));
  if (body.error) return body.error;
  try {
    const domain = emailDomain(body.data.email);
    if (!domain || isPublicDomain(domain)) return ok({ found: false });
    const company = await findCompanyByDomain(domain);
    return company ? ok({ found: true, name: company.name, code: company.code }) : ok({ found: false });
  } catch (err) {
    return serverError("[POST /api/company/domain-lookup]", err);
  }
}

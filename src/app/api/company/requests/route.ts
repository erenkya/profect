import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { createCourseRequest } from "@/lib/company-seats";

/** Onaylı şirket üyesinin şirket adminine eğitim talebi. */
export async function POST(request: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await parseBody(request, z.object({ course_id: z.number().int().positive() }));
  if (body.error) return body.error;
  try {
    const r = await createCourseRequest(guard.payload.userId, body.data.course_id);
    if (r.ok) return ok({ message: "Talebiniz şirket yöneticinize iletildi." });
    if (r.reason === "not_member") return fail("Talepte bulunmak için onaylı bir şirket üyesi olmalısınız.", 403);
    if (r.reason === "already_owned") return fail("Bu eğitime zaten erişiminiz var.", 409);
    if (r.reason === "duplicate") return fail("Bu eğitim için zaten açık bir talebiniz var.", 409);
    return fail("Eğitim bulunamadı.", 400);
  } catch (err) {
    return serverError("[POST /api/company/requests]", err);
  }
}

import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { programVideoUploadSchema } from "@/lib/admin-schemas";
import { getProgramById } from "@/lib/programs";
import { presignVideoUpload } from "@/lib/r2";
import { buildProgramVideoKey, randomId } from "@/lib/video-key";

/** Program tanıtım videosu yüklemesini başlatır: R2 anahtarını üretir ve tarayıcının doğrudan PUT edeceği imzalı adresi döner. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, programVideoUploadSchema);
  if (body.error) return body.error;
  const d = body.data;
  try {
    if (!(await getProgramById(d.program_id))) return fail("Program bulunamadı.", 404);
    const key = buildProgramVideoKey(d.program_id, randomId());
    const upload = await presignVideoUpload(key, d.size);
    return ok({ key, upload }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/uploads/program-video]", err);
  }
}

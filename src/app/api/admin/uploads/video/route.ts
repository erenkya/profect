import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { videoUploadSchema } from "@/lib/admin-schemas";
import { getModuleForKey } from "@/lib/lms";
import { presignVideoUpload } from "@/lib/r2";
import { buildVideoKey, randomId } from "@/lib/video-key";

/** Video yüklemesini başlatır: R2 anahtarını üretir ve tarayıcının doğrudan PUT edeceği imzalı adresi döner. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, videoUploadSchema);
  if (body.error) return body.error;
  const d = body.data;
  try {
    const mod = await getModuleForKey(d.module_id);
    if (!mod) return fail("Modül bulunamadı.", 404);
    const key = buildVideoKey(mod.course_slug, mod.id, mod.title, d.lesson_title, randomId());
    const upload = await presignVideoUpload(key, d.size);
    return ok({ key, upload }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/uploads/video]", err);
  }
}

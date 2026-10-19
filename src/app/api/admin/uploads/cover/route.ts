import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { coverUploadSchema } from "@/lib/admin-schemas";
import { buildCoverKey, type CoverType } from "@/lib/cover-key";
import { getCourseById } from "@/lib/lms";
import { presignCoverUpload } from "@/lib/r2";
import { randomId } from "@/lib/video-key";

/** Kapak resmi yüklemesini başlatır: R2 anahtarını üretir ve tarayıcının doğrudan PUT edeceği imzalı adresi döner. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, coverUploadSchema);
  if (body.error) return body.error;
  const d = body.data;
  try {
    if (!(await getCourseById(d.course_id))) return fail("Kurs bulunamadı.", 404);
    const key = buildCoverKey(d.course_id, d.content_type as CoverType, randomId());
    const upload = await presignCoverUpload(key, d.size, d.content_type);
    return ok({ key, upload }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/uploads/cover]", err);
  }
}

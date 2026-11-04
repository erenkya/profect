import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { coverUploadSchema } from "@/lib/admin-schemas";
import { buildCoverKey, buildProgramCoverKey, type CoverType } from "@/lib/cover-key";
import { getCourseById } from "@/lib/lms";
import { getProgramById } from "@/lib/programs";
import { presignCoverUpload } from "@/lib/r2";
import { randomId } from "@/lib/video-key";

/** Kurs ya da program kapak resmi yüklemesini başlatır: R2 anahtarını üretir ve tarayıcının doğrudan PUT edeceği imzalı adresi döner. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, coverUploadSchema);
  if (body.error) return body.error;
  const d = body.data;
  try {
    let key: string;
    if (d.program_id !== undefined) {
      if (!(await getProgramById(d.program_id))) return fail("Program bulunamadı.", 404);
      key = buildProgramCoverKey(d.program_id, d.content_type as CoverType, randomId());
    } else {
      if (!(await getCourseById(d.course_id!))) return fail("Kurs bulunamadı.", 404);
      key = buildCoverKey(d.course_id!, d.content_type as CoverType, randomId());
    }
    const upload = await presignCoverUpload(key, d.size, d.content_type);
    return ok({ key, upload }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/uploads/cover]", err);
  }
}

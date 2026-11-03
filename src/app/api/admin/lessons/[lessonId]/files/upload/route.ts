import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { lessonFileUploadSchema } from "@/lib/admin-schemas";
import { getLesson } from "@/lib/lms";
import { presignFileUpload } from "@/lib/r2";
import { buildLessonFileKey } from "@/lib/lesson-file";
import { randomId } from "@/lib/video-key";

type Ctx = { params: Promise<{ lessonId: string }> };

/** Ders dosyası yüklemesini başlatır: R2 anahtarını üretir ve tarayıcının doğrudan PUT edeceği imzalı adresi döner. */
export async function POST(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const lessonId = parseId((await params).lessonId);
  if (!lessonId) return fail("Geçersiz ders.", 400);
  const body = await parseBody(request, lessonFileUploadSchema);
  if (body.error) return body.error;
  try {
    const lesson = await getLesson(lessonId);
    if (!lesson) return fail("Ders bulunamadı.", 404);
    const key = buildLessonFileKey(lesson.id, body.data.file_name, randomId());
    const upload = await presignFileUpload(key, body.data.size);
    return ok({ key, upload }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/lessons/:id/files/upload]", err);
  }
}

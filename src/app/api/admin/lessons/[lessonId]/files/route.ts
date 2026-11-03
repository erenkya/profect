import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { lessonFileRegisterSchema } from "@/lib/admin-schemas";
import { MAX_LESSON_FILE_BYTES, cleanFileName, isBlockedFileName, lessonFileKeyForLesson, registerOrCleanup } from "@/lib/lesson-file";
import { addLessonFile } from "@/lib/lesson-files";
import { getLesson } from "@/lib/lms";
import { deleteFile, headFile } from "@/lib/r2";

type Ctx = { params: Promise<{ lessonId: string }> };

const isDuplicateEntry = (err: unknown) => (err as { code?: string }).code === "ER_DUP_ENTRY";

/** R2'ye yükleme bittikten sonra dosyayı derse kaydeder. Boyut istemciden değil R2'den (HEAD) okunur. */
export async function POST(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const lessonId = parseId((await params).lessonId);
  if (!lessonId) return fail("Geçersiz ders.", 400);
  const body = await parseBody(request, lessonFileRegisterSchema);
  if (body.error) return body.error;
  const d = body.data;
  try {
    const lesson = await getLesson(lessonId);
    if (!lesson) return fail("Ders bulunamadı.", 404);
    if (!lessonFileKeyForLesson(d.key, lesson.id)) return fail("Geçersiz dosya.", 400);
    const fileName = cleanFileName(d.file_name);
    if (isBlockedFileName(fileName)) return fail("Bu dosya türü yüklenemez.", 400);
    const head = await headFile(d.key);
    if (!head) return fail("Dosya R2'de bulunamadı; yeniden yükleyin.", 400);
    if (head.size < 1 || head.size > MAX_LESSON_FILE_BYTES) {
      await deleteFile(d.key);
      return fail(head.size < 1 ? "Dosya boş." : "Dosya en çok 150 MB olabilir.", 400);
    }
    const id = await registerOrCleanup(
      () => addLessonFile({ lessonId: lesson.id, title: d.title, fileName, key: d.key, size: head.size, contentType: d.content_type }),
      () => deleteFile(d.key),
      isDuplicateEntry,
    );
    return ok({ id }, 201);
  } catch (err) {
    if (isDuplicateEntry(err)) return fail("Bu dosya zaten kayıtlı.", 409);
    return serverError("[POST /api/admin/lessons/:id/files]", err);
  }
}

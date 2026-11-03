import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { lessonFileRenameSchema } from "@/lib/admin-schemas";
import { removeLessonFile, renameLessonFile } from "@/lib/lesson-files";
import { deleteFile } from "@/lib/r2";

type Ctx = { params: Promise<{ fileId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).fileId);
  if (!id) return fail("Geçersiz dosya.", 400);
  const body = await parseBody(request, lessonFileRenameSchema);
  if (body.error) return body.error;
  try {
    return (await renameLessonFile(id, body.data.title)) ? ok({}) : fail("Dosya bulunamadı.", 404);
  } catch (err) {
    return serverError("[PATCH /api/admin/lesson-files/:id]", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).fileId);
  if (!id) return fail("Geçersiz dosya.", 400);
  try {
    const key = await removeLessonFile(id);
    if (!key) return fail("Dosya bulunamadı.", 404);
    await deleteFile(key);
    return ok({});
  } catch (err) {
    return serverError("[DELETE /api/admin/lesson-files/:id]", err);
  }
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail, parseId, serverError } from "@/lib/http";
import { contentDispositionAttachment } from "@/lib/lesson-file";
import { getLessonFileForDownload } from "@/lib/lesson-files";
import { canAccessCourse } from "@/lib/lms";
import { presignFileDownload } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * Ders dosyasını indirtir. Dosya R2'den doğrudan (60 sn geçerli imzalı adresle) iner; imzalı adres yalnızca burada,
 * oturum + kurs erişimi doğrulandıktan sonra üretilir. Ücretsiz önizleme istisnası yoktur: erişim = yönetici ya da kayıtlı öğrenci.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ lessonId: string; fileId: string }> }) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const p = await params;
  const lessonId = parseId(p.lessonId);
  const fileId = parseId(p.fileId);
  if (!lessonId || !fileId) return fail("Geçersiz dosya.", 400);

  try {
    const file = await getLessonFileForDownload(lessonId, fileId);
    if (!file) return fail("Dosya bulunamadı.", 404);
    const { userId, role } = guard.payload;
    if (role !== "admin" && !(await canAccessCourse(userId, file.course_id))) return fail("Bu kursa erişiminiz yok.", 403);

    const url = await presignFileDownload(file.storage_key, contentDispositionAttachment(file.file_name));
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    return serverError("[GET /api/client/lessons/:id/files/:fileId]", err);
  }
}

import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail, parseId, serverError } from "@/lib/http";
import { canAccessCourse, getLesson } from "@/lib/lms";
import { parseByteRange } from "@/lib/byte-range";
import { getVideoRange, headVideo } from "@/lib/r2";
import { consumeVideoQuota } from "@/lib/video-quota";
import { VIDEO_CHUNK_BYTES, isVideoKey } from "@/lib/video-key";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Accept-Ranges": "bytes",
} as const;

/**
 * Ders videosunu akıtır. Tarayıcı R2'yi hiç görmez: her istekte oturum + kurs erişimi doğrulanır,
 * yanıt en çok VIDEO_CHUNK_BYTES'lık bir `Range` dilimidir (206). Bağlantıyı kopyalayan, giriş yapmadıkça izleyemez.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  // Adres çubuğuna yapıştırma / başka site: ek savunma (asıl koruma aşağıdaki oturum ve yetki kontrolü).
  if (request.headers.get("sec-fetch-dest") === "document" || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail("Bu adres doğrudan açılamaz.", 403);
  }
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const user = guard.payload;
  const id = parseId((await params).lessonId);
  if (!id) return fail("Geçersiz ders.", 400);

  try {
    const lesson = await getLesson(id);
    if (!lesson || lesson.lesson_type !== "video" || !isVideoKey(lesson.content)) return fail("Video bulunamadı.", 404);
    const isAdmin = user.role === "admin";
    if (!isAdmin && !(await canAccessCourse(user.userId, lesson.course_id))) return fail("Bu kursa erişiminiz yok.", 403);

    const head = await headVideo(lesson.content);
    if (!head) return fail("Video dosyası bulunamadı.", 404);
    const range = parseByteRange(request.headers.get("range"), head.size, VIDEO_CHUNK_BYTES);
    if (range === "unsatisfiable") {
      return new Response(null, { status: 416, headers: { ...BASE_HEADERS, "Content-Range": `bytes */${head.size}` } });
    }

    const chunk = await getVideoRange(lesson.content, range);
    if (!isAdmin && !(await consumeVideoQuota(user.userId, lesson.id, chunk.contentLength, chunk.total))) {
      await chunk.body.cancel();
      return new Response(JSON.stringify({ success: false, message: "Bu video için günlük izleme sınırına ulaşıldı." }), {
        status: 429,
        headers: { ...BASE_HEADERS, "Content-Type": "application/json", "Retry-After": "3600" },
      });
    }
    return new Response(chunk.body, {
      status: 206,
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "video/mp4",
        "Content-Length": String(chunk.contentLength),
        "Content-Range": `bytes ${chunk.start}-${chunk.end}/${chunk.total}`,
        "Content-Disposition": "inline",
      },
    });
  } catch (err) {
    return serverError("[GET /api/client/lessons/:id/video]", err);
  }
}

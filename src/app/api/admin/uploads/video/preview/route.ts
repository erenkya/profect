import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fail, serverError } from "@/lib/http";
import { parseByteRange } from "@/lib/byte-range";
import { getVideoRange, headVideo } from "@/lib/r2";
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
 * Yönetici, yüklediği videoyu ders kaydedilmeden önce de izleyebilsin diye R2 anahtarından akıtır.
 * Yalnızca yönetici; kota tüketmez. Anahtar biçimi doğrulanır, dilim en çok VIDEO_CHUNK_BYTES'tır.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!isVideoKey(key)) return fail("Geçersiz video.", 400);

  try {
    const head = await headVideo(key);
    if (!head) return fail("Video dosyası bulunamadı.", 404);
    const range = parseByteRange(request.headers.get("range"), head.size, VIDEO_CHUNK_BYTES);
    if (range === "unsatisfiable") {
      return new Response(null, { status: 416, headers: { ...BASE_HEADERS, "Content-Range": `bytes */${head.size}` } });
    }
    const chunk = await getVideoRange(key, range);
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
    return serverError("[GET /api/admin/uploads/video/preview]", err);
  }
}

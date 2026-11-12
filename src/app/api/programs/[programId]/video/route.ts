import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fail, parseId, serverError } from "@/lib/http";
import { parseByteRange } from "@/lib/byte-range";
import { getProgramById } from "@/lib/programs";
import { getVideoRange, headVideo } from "@/lib/r2";
import { consumeProgramVideoQuota } from "@/lib/video-quota";
import { VIDEO_CHUNK_BYTES, isProgramVideoKey } from "@/lib/video-key";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Accept-Ranges": "bytes",
} as const;

function clientIpHash(request: NextRequest): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Program tanıtım videosunu herkese açık akıtır (giriş gerekmez). Tarayıcı R2'yi hiç görmez; yanıt en çok
 * VIDEO_CHUNK_BYTES'lık bir `Range` dilimidir (206). Taslak programın videosunu yalnızca yönetici izleyebilir.
 * R2 çıkış maliyeti IP × program × gün kotasıyla sınırlanır (yönetici hariç).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ programId: string }> }) {
  // Adres çubuğuna yapıştırma / başka site: ek savunma.
  if (request.headers.get("sec-fetch-dest") === "document" || request.headers.get("sec-fetch-site") === "cross-site") {
    return fail("Bu adres doğrudan açılamaz.", 403);
  }
  const id = parseId((await params).programId);
  if (!id) return fail("Geçersiz program.", 400);

  try {
    const program = await getProgramById(id);
    const key = program?.intro_video_key ?? "";
    if (!program || !isProgramVideoKey(key)) return fail("Video bulunamadı.", 404);
    const isAdmin = (await getCurrentUser())?.role === "admin";
    if (!program.is_published && !isAdmin) return fail("Video bulunamadı.", 404);

    const head = await headVideo(key);
    if (!head) return fail("Video dosyası bulunamadı.", 404);
    const range = parseByteRange(request.headers.get("range"), head.size, VIDEO_CHUNK_BYTES);
    if (range === "unsatisfiable") {
      return new Response(null, { status: 416, headers: { ...BASE_HEADERS, "Content-Range": `bytes */${head.size}` } });
    }

    const chunk = await getVideoRange(key, range);
    if (!isAdmin && !(await consumeProgramVideoQuota(clientIpHash(request), program.id, chunk.contentLength, chunk.total))) {
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
    return serverError("[GET /api/programs/:id/video]", err);
  }
}

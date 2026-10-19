import { fail, serverError } from "@/lib/http";
import { coverContentType, coverKeyFromName } from "@/lib/cover-key";
import { getCover } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * Herkese açık kapak resmi. Tarayıcı R2'yi görmez; yalnızca `kapaklar/<kurs>-<rastgele>.<uzantı>` biçimindeki
 * anahtarlar sunulur. Anahtar her yüklemede değiştiği için yanıt değişmez (immutable) olarak önbelleğe alınır.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const key = coverKeyFromName((await params).name);
  const type = key && coverContentType(key);
  if (!key || !type) return fail("Resim bulunamadı.", 404);
  try {
    const cover = await getCover(key);
    if (!cover) return fail("Resim bulunamadı.", 404);
    return new Response(cover.body as BodyInit, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(cover.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return serverError("[GET /api/kapak/:name]", err);
  }
}


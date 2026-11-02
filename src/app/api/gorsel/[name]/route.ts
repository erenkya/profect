import { fail, serverError } from "@/lib/http";
import { postImageContentType, postImageKeyFromName } from "@/lib/post-key";
import { getPostImage } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * Herkese açık blog/haber görseli. Tarayıcı R2'yi görmez; yalnızca `gorseller/<16 hex>.<uzantı>` biçimindeki
 * anahtarlar sunulur. Anahtar her yüklemede değiştiği için yanıt değişmez (immutable) olarak önbelleğe alınır.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const key = postImageKeyFromName((await params).name);
  const type = key && postImageContentType(key);
  if (!key || !type) return fail("Görsel bulunamadı.", 404);
  try {
    const image = await getPostImage(key);
    if (!image) return fail("Görsel bulunamadı.", 404);
    return new Response(image.body as BodyInit, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(image.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return serverError("[GET /api/gorsel/:name]", err);
  }
}

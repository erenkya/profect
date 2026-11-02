import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { createPostSchema } from "@/lib/admin-schemas";
import { slugify } from "@/lib/format";
import { createPost, freePostSlug } from "@/lib/posts";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, createPostSchema);
  if (body.error) return body.error;
  const d = body.data;
  if (d.status === "published" && !d.content.trim()) return fail("Yayınlamak için içerik boş olamaz.");
  try {
    // Adres verilmediyse başlıktan üretilir; verilen adres doluysa 409 döner.
    const slug = d.slug ?? (await freePostSlug(d.type, slugify(d.title).slice(0, 120)));
    const id = await createPost({ ...d, slug, excerpt: d.excerpt ?? "", cover_key: d.cover_key ?? null, author: d.author ?? "Profect", published_at: d.published_at ?? null });
    return ok({ postId: id, slug }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") return fail("Bu adres (slug) bu türde zaten kullanılıyor.", 409);
    return serverError("[POST /api/admin/posts]", err);
  }
}

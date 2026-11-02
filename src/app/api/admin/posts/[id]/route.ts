import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { updatePostSchema } from "@/lib/admin-schemas";
import { deletePost, getPostById, updatePost } from "@/lib/posts";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Geçersiz yazı.", 404);
  const body = await parseBody(request, updatePostSchema);
  if (body.error) return body.error;
  try {
    const current = await getPostById(id);
    if (!current) return fail("Yazı bulunamadı.", 404);
    // Gelen alanlar mevcut kaydın üzerine bindirilir.
    const next = { ...current, ...body.data };
    if (next.status === "published" && !next.content.trim()) return fail("Yayınlamak için içerik boş olamaz.");
    await updatePost(id, next);
    return ok();
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") return fail("Bu adres (slug) bu türde zaten kullanılıyor.", 409);
    return serverError("[PATCH /api/admin/posts/:id]", err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Geçersiz yazı.", 404);
  try {
    return (await deletePost(id)) ? ok() : fail("Yazı bulunamadı.", 404);
  } catch (err) {
    return serverError("[DELETE /api/admin/posts/:id]", err);
  }
}

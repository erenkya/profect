import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseId, serverError } from "@/lib/http";
import { deleteRule } from "@/lib/meetings";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const id = parseId((await params).id);
  if (!id) return fail("Geçersiz kural.", 400);
  try {
    return (await deleteRule(id)) ? ok() : fail("Kural bulunamadı.", 404);
  } catch (err) {
    return serverError("[DELETE /api/admin/meeting-rules/:id]", err);
  }
}

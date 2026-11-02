import { requireAdmin } from "@/lib/auth";
import { ok, parseBody, serverError } from "@/lib/http";
import { postImageUploadSchema } from "@/lib/admin-schemas";
import { buildPostImageKey, type PostImageType } from "@/lib/post-key";
import { presignPostImageUpload } from "@/lib/r2";
import { randomId } from "@/lib/video-key";

/** Blog/haber görseli yüklemesini başlatır: R2 anahtarını üretir ve tarayıcının doğrudan PUT edeceği imzalı adresi döner. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, postImageUploadSchema);
  if (body.error) return body.error;
  const d = body.data;
  try {
    const key = buildPostImageKey(d.content_type as PostImageType, randomId() + randomId());
    const upload = await presignPostImageUpload(key, d.size, d.content_type);
    return ok({ key, upload }, 201);
  } catch (err) {
    return serverError("[POST /api/admin/uploads/post-image]", err);
  }
}

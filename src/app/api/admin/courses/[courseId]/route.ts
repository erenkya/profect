import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { getCourseAdminTree } from "@/lib/lms";
import { listVideoKeys } from "@/lib/lesson-video";
import { deleteCover, deleteVideos, headCover } from "@/lib/r2";
import { coverKeyForCourse } from "@/lib/cover-key";
import { updateCourseSchema } from "@/lib/admin-schemas";

type Ctx = { params: Promise<{ courseId: string }> };

/** Yönetici görünümü: içerik (video ID / Markdown) dahil tam ağaç. */
export async function GET(_req: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const courseId = parseId((await params).courseId);
  if (!courseId) return fail("Geçersiz kurs.", 400);
  try {
    const tree = await getCourseAdminTree(courseId);
    return tree ? ok(tree) : fail("Kurs bulunamadı.", 404);
  } catch (err) {
    return serverError("[GET /api/admin/courses/:id]", err);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const courseId = parseId((await params).courseId);
  if (!courseId) return fail("Geçersiz kurs.", 400);
  const body = await parseBody(request, updateCourseSchema);
  if (body.error) return body.error;

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(body.data)) {
    if (value === undefined) continue;
    sets.push(`${key} = ?`); // anahtarlar zod şemasından geldiği için güvenli (serbest kullanıcı girdisi değil)
    values.push(key === "outcomes" ? JSON.stringify(value) : key === "is_published" ? (value ? 1 : 0) : value);
  }
  if (sets.length === 0) return fail("Güncellenecek alan yok.", 400);

  try {
    // Kapak değişiyorsa: yeni anahtar bu kursa ait ve R2'de var olmalı; eski dosya güncellemeden sonra silinir.
    let oldCover: string | null = null;
    const newCover = body.data.thumbnail_url;
    if (newCover !== undefined) {
      if (newCover !== null) {
        if (!coverKeyForCourse(newCover, courseId)) return fail("Geçersiz kapak resmi.", 400);
        if (!(await headCover(newCover))) return fail("Kapak resmi R2'de bulunamadı; yeniden yükleyin.", 400);
      }
      const [cur] = await pool.query<RowDataPacket[]>("SELECT thumbnail_url FROM courses WHERE id = ?", [courseId]);
      oldCover = (cur[0]?.thumbnail_url as string | null | undefined) ?? null;
    }
    values.push(courseId);
    const [res] = await pool.execute<ResultSetHeader>(`UPDATE courses SET ${sets.join(", ")} WHERE id = ?`, values as never[]);
    if (res.affectedRows === 0) return fail("Kurs bulunamadı.", 404);
    if (oldCover && oldCover !== newCover) await deleteCover(oldCover);
    return ok({ message: "Kurs güncellendi." });
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") return fail("Bu slug veya kurs kodu zaten kullanılıyor.", 409);
    return serverError("[PATCH /api/admin/courses/:id]", err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const courseId = parseId((await params).courseId);
  if (!courseId) return fail("Geçersiz kurs.", 400);
  try {
    // Modüller, dersler, sınavlar, kayıtlar, ilerleme ve sertifikalar FK CASCADE ile silinir.
    const keys = await listVideoKeys("course", courseId);
    const [cur] = await pool.query<RowDataPacket[]>("SELECT thumbnail_url FROM courses WHERE id = ?", [courseId]);
    const cover = (cur[0]?.thumbnail_url as string | null | undefined) ?? null;
    const [res] = await pool.execute<ResultSetHeader>("DELETE FROM courses WHERE id = ?", [courseId]);
    if (res.affectedRows === 0) return fail("Kurs bulunamadı.", 404);
    await deleteVideos(keys);
    if (cover) await deleteCover(cover);
    return ok({ message: "Kurs silindi." });
  } catch (err) {
    return serverError("[DELETE /api/admin/courses/:id]", err);
  }
}

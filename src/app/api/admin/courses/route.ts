import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { listAllCourses } from "@/lib/lms";
import { createCourseSchema } from "@/lib/admin-schemas";
import { randomCourseCode, slugify, uniqueSlug } from "@/lib/format";

/** Başlıktan türeyen slug başka bir kursta varsa -2, -3… ekler. */
async function freeSlug(base: string): Promise<string> {
  const root = base || "kurs";
  const [rows] = await pool.query<RowDataPacket[]>("SELECT slug FROM courses WHERE slug = ? OR slug LIKE ?", [root, `${root.replace(/[\\%_]/g, "\\$&")}-%`]);
  return uniqueSlug(root, rows.map((r) => r.slug as string));
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    return ok({ data: await listAllCourses() });
  } catch (err) {
    return serverError("[GET /api/admin/courses]", err);
  }
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, createCourseSchema);
  if (body.error) return body.error;
  const d = body.data;
  // Slug ve kod otomatik üretilir; eşzamanlı istekten kaynaklı çakışmada yeniden denenir.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = d.slug ?? (await freeSlug(slugify(d.title)));
    const code = d.code ?? randomCourseCode();
    try {
      const [res] = await pool.execute<ResultSetHeader>(
        `INSERT INTO courses (slug, code, title, description, category, level, instructor, price, old_price, outcomes, is_published)
         VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
        [slug, code, d.title, d.description, d.category ?? "", d.level ?? "Başlangıç", d.instructor ?? "", d.price ?? 0, d.old_price ?? null, JSON.stringify(d.outcomes ?? [])],
      );
      return ok({ courseId: res.insertId, slug }, 201);
    } catch (err) {
      if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
        if (d.slug && d.code) return fail("Bu slug veya kurs kodu zaten kullanılıyor.", 409);
        continue;
      }
      return serverError("[POST /api/admin/courses]", err);
    }
  }
  return fail("Benzersiz slug/kod üretilemedi; tekrar deneyin.", 409);
}

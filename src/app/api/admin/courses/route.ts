import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { listAllCourses } from "@/lib/lms";
import { createCourseSchema } from "@/lib/admin-schemas";
import { slugify } from "@/lib/format";

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
  try {
    const slug = d.slug ?? (slugify(d.title) || `kurs-${Date.now()}`);
    const code = d.code ?? `PRF-${Date.now().toString().slice(-6)}`;
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO courses (slug, code, title, description, category, level, instructor, hours, price, old_price, outcomes, is_published)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
      [slug, code, d.title, d.description, d.category ?? "", d.level ?? "Başlangıç", d.instructor ?? "", d.hours ?? 0, d.price ?? 0, d.old_price ?? null, JSON.stringify(d.outcomes ?? [])],
    );
    return ok({ courseId: res.insertId, slug }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") return fail("Bu slug veya kurs kodu zaten kullanılıyor.", 409);
    return serverError("[POST /api/admin/courses]", err);
  }
}

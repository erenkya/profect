import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, serverError } from "@/lib/http";
import { createProgramSchema } from "@/lib/admin-schemas";
import { slugify, uniqueSlug } from "@/lib/format";
import { getCourseEligibility, listAdminPrograms } from "@/lib/programs";
import { priceProblem } from "@/lib/program-rules";

/** Başlıktan türeyen slug başka bir programda varsa -2, -3… ekler. */
async function freeSlug(base: string): Promise<string> {
  const root = base || "program";
  const [rows] = await pool.query<RowDataPacket[]>("SELECT slug FROM programs WHERE slug = ? OR slug LIKE ?", [root, `${root.replace(/[\\%_]/g, "\\$&")}-%`]);
  return uniqueSlug(root, rows.map((r) => r.slug as string));
}

function randomProgramCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return `PRG-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    return ok({ data: await listAdminPrograms() });
  } catch (err) {
    return serverError("[GET /api/admin/programs]", err);
  }
}

/**
 * Program her zaman taslak olarak oluşur. Kurs sorunları (yayında değil / final sınavı yok) taslakta serbesttir,
 * yayına alırken denetlenir; fiyat kuralı (B ≤ S) ise taslakta da geçerlidir.
 */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, createProgramSchema);
  if (body.error) return body.error;
  const d = body.data;

  try {
    const courses = await getCourseEligibility(d.course_ids);
    if (courses.length !== d.course_ids.length) return fail("Seçilen kurslardan biri bulunamadı.", 400);
    const problem = priceProblem(d.price, courses);
    if (problem) return fail(problem, 400);

    // Slug ve kod otomatik üretilir; eşzamanlı istekten kaynaklı çakışmada yeniden denenir.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = d.slug ?? (await freeSlug(slugify(d.title)));
      const code = d.code ?? randomProgramCode();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [res] = await conn.execute<ResultSetHeader>(
          "INSERT INTO programs (slug, code, title, description, category, price, is_published) VALUES (?,?,?,?,?,?,0)",
          [slug, code, d.title, d.description, d.category ?? "", d.price],
        );
        await conn.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES ?", [d.course_ids.map((id, i) => [res.insertId, id, i])]);
        await conn.commit();
        return ok({ programId: res.insertId, slug }, 201);
      } catch (err) {
        await conn.rollback();
        if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
          if (d.slug && d.code) return fail("Bu slug veya program kodu zaten kullanılıyor.", 409);
          continue;
        }
        throw err;
      } finally {
        conn.release();
      }
    }
    return fail("Benzersiz slug/kod üretilemedi; tekrar deneyin.", 409);
  } catch (err) {
    return serverError("[POST /api/admin/programs]", err);
  }
}

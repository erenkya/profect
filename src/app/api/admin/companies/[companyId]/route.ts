import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fail, ok, parseBody, parseId, serverError } from "@/lib/http";
import { isPublicDomain, normalizeDomain } from "@/lib/company-rules";

const schema = z
  .object({ is_active: z.boolean().optional(), add_domain: z.string().max(190).optional() })
  .refine((v) => v.is_active !== undefined || v.add_domain !== undefined, "Güncellenecek bir alan gönderin.");

/** Ana admin: şirketi aktif/pasif yapar ya da mail uzantısı ekler. Pasif şirketin kodu ve uzantısı eşleşme vermez. */
export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const companyId = parseId((await params).companyId);
  if (!companyId) return fail("Geçersiz istek.", 400);
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await parseBody(request, schema);
  if (body.error) return body.error;
  try {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM companies WHERE id = ?", [companyId]);
    if (rows.length === 0) return fail("Şirket bulunamadı.", 404);

    // Doğrulama ve çakışma önce: hata varsa hiçbir şey değişmesin.
    if (body.data.add_domain !== undefined) {
      const domain = normalizeDomain(body.data.add_domain);
      if (!domain || isPublicDomain(domain)) return fail("Geçerli bir kurumsal alan adı girin (genel posta sağlayıcıları kabul edilmez).", 400);
      try {
        await pool.execute("INSERT INTO company_domains (company_id, domain) VALUES (?, ?)", [companyId, domain]);
      } catch (err) {
        if ((err as { code?: string }).code === "ER_DUP_ENTRY") return fail("Bu mail uzantısı zaten bir şirkete tanımlı.", 409);
        throw err;
      }
    }
    if (body.data.is_active !== undefined) await pool.execute("UPDATE companies SET is_active = ? WHERE id = ?", [body.data.is_active ? 1 : 0, companyId]);
    return ok({ message: "Güncellendi." });
  } catch (err) {
    return serverError("[PATCH /api/admin/companies/:id]", err);
  }
}

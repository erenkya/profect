import "server-only";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { getCurrentUser, requireUser, type JwtPayload, type SessionUser } from "@/lib/auth";
import { getMembership } from "@/lib/company";

type CompanyGuard =
  | { payload: JwtPayload; actor: "platform" | "company"; error?: undefined }
  | { payload?: undefined; actor?: undefined; error: NextResponse };

const deny = (status: number, message: string): CompanyGuard => ({ error: NextResponse.json({ success: false, message }, { status }) });

/**
 * Şirket API'lerinin tek kapısı. Ana admin her şirkete girer (şirket yoksa 404); şirket admini yalnızca KENDİ şirketine
 * (DB'deki aktif admin üyeliğiyle, JWT'ye bakılmaz). Başkası 403: şirketin var olup olmadığı sızmaz.
 */
export async function requireCompanyAccess(companyId: number): Promise<CompanyGuard> {
  const guard = await requireUser();
  if (guard.error) return guard;
  if (guard.payload.role === "admin") {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM companies WHERE id = ?", [companyId]);
    return rows.length > 0 ? { payload: guard.payload, actor: "platform" } : deny(404, "Şirket bulunamadı.");
  }
  const m = await getMembership(guard.payload.userId);
  if (!m || m.companyId !== companyId || m.role !== "admin" || m.status !== "active") return deny(403, "Bu şirket için yetkiniz yok.");
  return { payload: guard.payload, actor: "company" };
}

/** Şirket paneli sayfaları için: şirket admini değilse yönlendirir. */
export async function requireCompanyAdminPage(): Promise<{ user: SessionUser; companyId: number }> {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/sirket");
  const m = await getMembership(user.id);
  if (m && m.role === "admin" && m.status === "active") return { user, companyId: m.companyId };
  redirect(user.role === "admin" ? "/admin/sirketler" : "/hesabim");
}

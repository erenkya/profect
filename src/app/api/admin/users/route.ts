import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ok, serverError } from "@/lib/http";

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    // Parola/token alanları bilerek SEÇİLMEZ.
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.is_active, u.email_verified, u.plus_until,
              u.last_login_at, u.created_at,
              (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS enrollment_count
         FROM users u ORDER BY u.created_at DESC LIMIT 1000`,
    );
    return ok({ data: rows });
  } catch (err) {
    return serverError("[GET /api/admin/users]", err);
  }
}

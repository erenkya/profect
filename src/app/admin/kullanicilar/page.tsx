import type { RowDataPacket } from "mysql2";
import { UsersTable, type AdminUser } from "@/components/admin/UsersTable";
import { requireAdminPage } from "@/lib/admin-guard";
import pool from "@/lib/db";

export const metadata = { title: "Kullanıcılar" };

export default async function AdminUsers() {
  const me = await requireAdminPage();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.email_verified, u.last_login_at, u.created_at,
            (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id) AS enrollment_count,
            co.name AS company_name, cm.status AS company_status
       FROM users u
       LEFT JOIN company_members cm ON cm.user_id = u.id
       LEFT JOIN companies co ON co.id = cm.company_id
      ORDER BY u.created_at DESC LIMIT 1000`,
  );
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 24px" }}>Kullanıcılar</h1>
      <UsersTable users={rows as AdminUser[]} currentUserId={me.id} />
    </>
  );
}

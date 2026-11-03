import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Şirketler" };

export default async function AdminCompanies() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.name, c.code, c.is_active, c.created_at,
            (SELECT GROUP_CONCAT(d.domain ORDER BY d.domain SEPARATOR ', ') FROM company_domains d WHERE d.company_id = c.id) AS domains,
            (SELECT COUNT(*) FROM company_members m WHERE m.company_id = c.id AND m.status = 'active') AS active_members,
            (SELECT COUNT(*) FROM company_members m WHERE m.company_id = c.id AND m.status = 'pending') AS pending_members,
            COALESCE((SELECT SUM(a.quantity) FROM company_allocations a WHERE a.company_id = c.id), 0) AS total,
            (SELECT COUNT(*) FROM company_assignments s WHERE s.company_id = c.id AND s.status = 'active') AS assigned,
            (SELECT COUNT(*) FROM company_assignments s WHERE s.company_id = c.id AND s.status = 'burned') AS burned
       FROM companies c ORDER BY c.created_at DESC LIMIT 1000`,
  );
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 24px" }}>Şirketler</h1>
      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>Şirket</th><th>Kod</th><th>Uzantılar</th><th>Üye</th><th>Bekleyen</th><th>Kontenjan (toplam / atanan / yanan)</th><th>Durum</th><th>Kayıt</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/admin/sirketler/${c.id}`}>{c.name}</Link></td>
                <td><code>{c.code}</code></td>
                <td>{c.domains ? String(c.domains).split(", ").map((d) => `@${d}`).join(", ") : "—"}</td>
                <td>{c.active_members}</td>
                <td>{Number(c.pending_members) > 0 ? <span className="tag tag-accent-2">{c.pending_members}</span> : 0}</td>
                <td>{Number(c.total)} / {Number(c.assigned)} / {Number(c.burned)}</td>
                <td><span className={`tag ${c.is_active ? "tag-accent" : "tag-neutral"}`}>{c.is_active ? "Aktif" : "Pasif"}</span></td>
                <td>{formatDate(c.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} style={{ color: "var(--muted-55)" }}>Henüz şirket yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

import type { RowDataPacket } from "mysql2";
import Link from "next/link";
import { Corners } from "@/components/Corners";
import pool from "@/lib/db";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Genel bakış" };

export default async function AdminHome() {
  const [[s]] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM courses WHERE is_published = 1) AS published,
        (SELECT COUNT(*) FROM courses WHERE is_published = 0) AS drafts,
        (SELECT COUNT(*) FROM enrollments) AS enrollments,
        (SELECT COUNT(*) FROM certificates) AS certificates,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
        (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE status = 'paid') AS revenue`,
    ),
  ]);
  const st = s[0];
  const cards = [
    { k: "Kullanıcı", v: st.users },
    { k: "Yayında kurs", v: st.published, sub: `${st.drafts} taslak` },
    { k: "Kayıt", v: st.enrollments },
    { k: "Sertifika", v: st.certificates },
    { k: "Bekleyen sipariş", v: st.pending_orders, href: "/admin/siparisler" },
    { k: "Ciro (onaylı)", v: formatPrice(st.revenue) },
  ];
  return (
    <>
      <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: "0 0 28px" }}>Genel bakış</h1>
      <div className="stat-grid">
        {cards.map((c) => {
          const body = (
            <div className="card blueprint" style={{ background: "#fff", padding: 20, gap: 6, height: "100%" }}>
              <Corners />
              <div className="card-kicker" style={{ fontSize: 11 }}>{c.k}</div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 44, lineHeight: 1, fontWeight: 700 }}>{c.v}</div>
              {c.sub && <div className="card-meta">{c.sub}</div>}
            </div>
          );
          return c.href ? <Link key={c.k} href={c.href} style={{ color: "inherit", textDecoration: "none" }}>{body}</Link> : <div key={c.k}>{body}</div>;
        })}
      </div>
    </>
  );
}

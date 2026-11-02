import Link from "next/link";
import { Corners } from "@/components/Corners";
import { listAllPosts } from "@/lib/posts";
import { POST_TYPES, formatPostDate } from "@/lib/post-types";

export const metadata = { title: "Blog & Haber" };

export default async function AdminPosts() {
  const posts = await listAllPosts();
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: 0 }}>Blog & Haber</h1>
        <Link href="/admin/yazilar/yeni" className="btn btn-primary blueprint"><Corners />Yeni yazı</Link>
      </div>
      <p style={{ color: "var(--muted-72)", marginBottom: 24 }}>Yazılar Markdown ile yazılır ya da .md dosyası olarak yüklenir; görseller ayrı bir R2 bucket’ında durur. Yalnızca “Yayında” olanlar sitede görünür.</p>
      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>Tür</th><th>Başlık</th><th>Yazar</th><th>Tarih</th><th>Durum</th><th /></tr></thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td>{POST_TYPES[p.type].label}</td>
                <td style={{ whiteSpace: "normal", minWidth: 280 }}>{p.title}</td>
                <td>{p.author}</td>
                <td>{formatPostDate(p.published_at) || "—"}</td>
                <td><span className={`tag ${p.status === "published" ? "tag-accent" : "tag-neutral"}`}>{p.status === "published" ? "Yayında" : "Taslak"}</span></td>
                <td><Link href={`/admin/yazilar/${p.id}`}>Düzenle →</Link></td>
              </tr>
            ))}
            {posts.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted-55)" }}>Henüz yazı yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

import Link from "next/link";
import { NewCourseForm } from "@/components/admin/NewCourseForm";
import { formatPrice } from "@/lib/format";
import { listAllCourses } from "@/lib/lms";

export const metadata = { title: "Kurslar" };

export default async function AdminCourses() {
  const courses = await listAllCourses();
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: 0 }}>Kurslar</h1>
      </div>
      <NewCourseForm />
      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>Kod</th><th>Başlık</th><th>Kategori</th><th>Modül</th><th>Ders</th><th>Fiyat</th><th>Durum</th><th /></tr></thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>{c.title}</td>
                <td>{c.category}</td>
                <td>{c.module_count}</td>
                <td>{c.lesson_count}</td>
                <td>{formatPrice(c.price)}</td>
                <td><span className={`tag ${c.is_published ? "tag-accent" : "tag-neutral"}`}>{c.is_published ? "Yayında" : "Taslak"}</span></td>
                <td><Link href={`/admin/kurslar/${c.id}`}>Düzenle →</Link></td>
              </tr>
            ))}
            {courses.length === 0 && <tr><td colSpan={8} style={{ color: "var(--muted-55)" }}>Henüz kurs yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

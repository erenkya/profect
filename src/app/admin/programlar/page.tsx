import Link from "next/link";
import { ProgramBuilder } from "@/components/admin/ProgramBuilder";
import { formatPrice } from "@/lib/format";
import { listCategories } from "@/lib/lms";
import { listAdminPrograms, listPublishedCourseOptions } from "@/lib/programs";

export const metadata = { title: "Programlar" };

export default async function AdminPrograms() {
  const [programs, options, categories] = await Promise.all([listAdminPrograms(), listPublishedCourseOptions(), listCategories()]);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <h1 style={{ fontSize: 56, textTransform: "uppercase", margin: 0 }}>Programlar</h1>
      </div>
      <ProgramBuilder options={options} categories={categories} />
      <div className="admin-table-wrap">
        <table className="table">
          <thead><tr><th>Kod</th><th>Başlık</th><th>Kategori</th><th>Kurs</th><th>Ayrı ayrı</th><th>Program fiyatı</th><th>Durum</th><th /></tr></thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>{p.title}</td>
                <td>{p.category}</td>
                <td>{p.course_count}</td>
                <td>{formatPrice(p.list_total)}</td>
                <td>{formatPrice(p.price)}</td>
                <td>
                  <span className={`tag ${p.is_published ? "tag-accent" : "tag-neutral"}`}>{p.is_published ? "Yayında" : "Taslak"}</span>
                  {p.problem_courses > 0 && <> <span className="tag tag-accent-2" title="Yayında olmayan ya da final sınavı eksik kurslar var">{p.problem_courses} kurs sorunlu</span></>}
                </td>
                <td><Link href={`/admin/programlar/${p.id}`}>Düzenle →</Link></td>
              </tr>
            ))}
            {programs.length === 0 && <tr><td colSpan={8} style={{ color: "var(--muted-55)" }}>Henüz program yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

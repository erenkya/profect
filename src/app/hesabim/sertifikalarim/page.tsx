import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/account/PageTitle";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listMyCertificates } from "@/lib/lms";

export const metadata: Metadata = { title: "Sertifikalarım" };

export default async function MyCertificatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim/sertifikalarim");
  const certs = await listMyCertificates(user.id);
  return (
    <>
      <PageTitle title="Sertifikalarım" />
      {certs.length === 0 ? (
        <p style={{ color: "var(--muted-72)" }}>Final sınavını geçtiğinde sertifikaların burada görünür. <Link href="/hesabim/kurslarim">Kurslarıma git →</Link></p>
      ) : (
        <div className="admin-table-wrap">
          <table className="table">
            <thead><tr><th>Kurs</th><th>Numara</th><th>Puan</th><th>Tarih</th><th>PDF</th></tr></thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.certificate_code}>
                  <td>{c.course_title}</td>
                  <td><Link href={`/sertifika/${c.certificate_code}`}>{c.certificate_code}</Link></td>
                  <td>{c.score !== null ? `%${c.score}` : "—"}</td>
                  <td>{formatDate(c.issued_at)}</td>
                  <td><a href={`/api/public/certificates/${encodeURIComponent(c.certificate_code)}/pdf`}>İndir</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

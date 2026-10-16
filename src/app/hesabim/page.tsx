import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Corners } from "@/components/Corners";
import { ChangePasswordForm } from "@/components/learn/ChangePasswordForm";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatPrice } from "@/lib/format";
import { hasPlus, listMyCertificates, listMyCourses, listMyOrders } from "@/lib/lms";

export const metadata: Metadata = { title: "Hesabım" };

const ORDER_STATUS = { pending: "Onay bekliyor", paid: "Ödendi", rejected: "Reddedildi" } as const;

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim");
  const [courses, certs, orders, plus] = await Promise.all([listMyCourses(user.id), listMyCertificates(user.id), listMyOrders(user.id), hasPlus(user.id)]);

  return (
    <main className="wrap" style={{ paddingBlock: "clamp(40px,6vw,80px) 120px" }}>
      <div className="eyebrow">Hesabım</div>
      <h1 style={{ fontSize: "clamp(44px,6vw,80px)", lineHeight: 0.95, textTransform: "uppercase", margin: "0 0 8px" }}>Merhaba, {user.full_name.split(" ")[0]}</h1>
      <p style={{ color: "var(--muted-72)", marginBottom: 48 }}>{user.email}{plus && <> · <span className="tag tag-accent">Profect Plus</span></>}</p>

      <h2 style={{ fontSize: 36, textTransform: "uppercase", marginBottom: 20 }}>Kurslarım</h2>
      {courses.length === 0 ? (
        <p style={{ color: "var(--muted-72)", marginBottom: 56 }}>Henüz bir kursun yok. <Link href="/kurslar">Kursları keşfet →</Link></p>
      ) : (
        <div className="course-grid" style={{ marginBottom: 56 }}>
          {courses.map((c) => (
            <div key={c.id} className="card blueprint" style={{ background: "#fff", padding: 22, gap: 12 }}>
              <Corners />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="card-kicker" style={{ fontSize: 11 }}>{c.category}</span>
                <span className={`tag ${c.status === "completed" ? "tag-accent" : "tag-neutral"}`}>{c.status === "completed" ? "Tamamlandı" : "Devam ediyor"}</span>
              </div>
              <div className="card-title" style={{ fontSize: 24 }}>{c.title}</div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${c.percentage}%` }} /></div>
              <div className="card-meta" style={{ fontSize: 12, justifyContent: "space-between" }}><span>{c.completed_lessons} / {c.lesson_count} ders</span><span>%{c.percentage}</span></div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                <Link href={`/ogrenim/${c.slug}`} className="btn btn-primary blueprint" style={{ padding: "8px 18px" }}><Corners />{c.completed_lessons > 0 ? "Devam Et" : "Başla"}</Link>
                {c.certificate_code && <Link href={`/sertifika/${c.certificate_code}`} className="btn btn-secondary" style={{ padding: "8px 18px" }}>Sertifika</Link>}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 36, textTransform: "uppercase", marginBottom: 20 }}>Sertifikalarım</h2>
      {certs.length === 0 ? (
        <p style={{ color: "var(--muted-72)", marginBottom: 56 }}>Final sınavını geçtiğinde sertifikaların burada görünür.</p>
      ) : (
        <div className="admin-table-wrap" style={{ marginBottom: 56 }}>
          <table className="table">
            <thead><tr><th>Kurs</th><th>Numara</th><th>Puan</th><th>Tarih</th></tr></thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.certificate_code}>
                  <td>{c.course_title}</td>
                  <td><Link href={`/sertifika/${c.certificate_code}`}>{c.certificate_code}</Link></td>
                  <td>{c.score !== null ? `%${c.score}` : "—"}</td>
                  <td>{formatDate(c.issued_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orders.length > 0 && (
        <>
          <h2 style={{ fontSize: 36, textTransform: "uppercase", marginBottom: 20 }}>Siparişlerim</h2>
          <div className="admin-table-wrap" style={{ marginBottom: 56 }}>
            <table className="table">
              <thead><tr><th>#</th><th>Ürün</th><th>Tutar</th><th>Durum</th><th>Tarih</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.id}</td>
                    <td>{o.plan === "plus" ? "Profect Plus (aylık)" : o.course_title ?? "—"}</td>
                    <td>{formatPrice(o.amount)}</td>
                    <td>{ORDER_STATUS[o.status]}</td>
                    <td>{formatDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 style={{ fontSize: 36, textTransform: "uppercase", marginBottom: 20 }}>Şifre</h2>
      <ChangePasswordForm />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MyCourseCard } from "@/components/account/MyCourseCard";
import { PageTitle } from "@/components/account/PageTitle";
import { Corners } from "@/components/Corners";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getPlusInfo, listMyCertificates, listMyCourses, listMyOrders } from "@/lib/lms";

export const metadata: Metadata = { title: "Genel bakış" };

export default async function AccountHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim");
  const [courses, certs, orders, plus] = await Promise.all([listMyCourses(user.id), listMyCertificates(user.id), listMyOrders(user.id), getPlusInfo(user.id)]);
  const current = courses.find((c) => c.status === "active");
  const stats = [
    { k: "Aktif kurs", v: courses.filter((c) => c.status === "active").length, href: "/hesabim/kurslarim" },
    { k: "Tamamlanan", v: courses.filter((c) => c.status === "completed").length, href: "/hesabim/kurslarim" },
    { k: "Sertifika", v: certs.length, href: "/hesabim/sertifikalarim" },
    { k: "Sipariş", v: orders.length, href: "/hesabim/siparislerim" },
  ];

  return (
    <>
      <PageTitle title={`Merhaba, ${user.full_name.split(" ")[0]}`} hint={<>{user.email}{plus.active && <> · <span className="tag tag-accent">Profect Plus</span></>}</>} />

      <div className="stat-grid">
        {stats.map((s, i) => (
          <Link key={s.k} href={s.href} data-reveal data-delay={i * 70} style={{ color: "inherit", textDecoration: "none" }}>
            <div className="card blueprint acc-stat" style={{ background: "#fff", padding: 20, gap: 6, height: "100%" }}>
              <Corners />
              <div className="card-kicker" style={{ fontSize: 11 }}>{s.k}</div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 44, lineHeight: 1, fontWeight: 700 }}>{s.v}</div>
            </div>
          </Link>
        ))}
      </div>

      <h2 style={{ fontSize: 32, textTransform: "uppercase", marginBottom: 16 }}>Kaldığın yerden devam et</h2>
      {current ? (
        <div style={{ maxWidth: 440, marginBottom: 40 }}><MyCourseCard c={current} /></div>
      ) : (
        <p style={{ color: "var(--muted-72)", marginBottom: 40 }}>Devam eden bir kursun yok. <Link href="/kurslar">Kursları keşfet →</Link></p>
      )}

      {!plus.active && (
        <div className="card blueprint" style={{ background: "var(--color-accent-2-100)", padding: 22, gap: 8, maxWidth: 560 }}>
          <Corners />
          <div className="card-title" style={{ fontSize: 24 }}>Profect Plus ile tüm kurslar açık</div>
          <p className="card-body" style={{ fontSize: 15 }}>Tüm kurslara ve sınırsız sertifikaya aylık erişim.</p>
          <div><Link href="/hesabim/abonelik" className="btn btn-secondary" style={{ padding: "8px 18px" }}>Ayrıntılar</Link></div>
        </div>
      )}
      {plus.active && plus.until && <p style={{ color: "var(--muted-72)" }}>Profect Plus erişimin {formatDate(plus.until)} tarihine kadar açık.</p>}
    </>
  );
}

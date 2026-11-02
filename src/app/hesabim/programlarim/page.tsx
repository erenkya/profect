import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { Corners } from "@/components/Corners";
import { PageTitle } from "@/components/account/PageTitle";
import { getCurrentUser } from "@/lib/auth";
import { ensureProgramProgress, listMyPrograms } from "@/lib/programs";

export const metadata: Metadata = { title: "Programlarım" };

export default async function MyProgramsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/giris?next=/hesabim/programlarim");
  // Tembel geriye dönük üretim: kursları ayrı ayrı bitirmiş kullanıcıya üyelik ve program sertifikası burada yazılır.
  try {
    await ensureProgramProgress(user.id);
  } catch (err) {
    console.error("ensureProgramProgress failed", err);
  }
  const programs = await listMyPrograms(user.id);
  return (
    <>
      <PageTitle title="Programlarım" hint="Üye olduğun uzmanlık programları ve kurs bazlı ilerlemen." />
      {programs.length === 0 ? (
        <p style={{ color: "var(--muted-72)" }}>Henüz bir programa üye değilsin. <Link href="/programlar">Programları keşfet →</Link></p>
      ) : (
        <div className="course-grid acc-grid">
          {programs.map((m, i) => {
            const pct = m.total ? Math.round((m.completed / m.total) * 100) : 0;
            return (
              <div key={m.program.id} data-reveal data-delay={Math.min(i, 5) * 70}>
                <div className="card blueprint" style={{ background: "#fff", padding: 22, gap: 12 }}>
                  <Corners />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span className="card-kicker" style={{ fontSize: 11 }}>{m.program.category || "Uzmanlık Programı"} · {m.program.code}</span>
                    <span className={`tag ${m.certificate_code ? "tag-accent" : "tag-neutral"}`}>{m.certificate_code ? "Tamamlandı" : "Devam ediyor"}</span>
                  </div>
                  <div className="card-title" style={{ fontSize: 24 }}>{m.program.title}</div>
                  <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                  <div className="card-meta" style={{ fontSize: 12, justifyContent: "space-between" }}><span>{m.completed}/{m.total} kurs</span><span>%{pct}</span></div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", fontSize: 14 }}>
                    {m.courses.map((c) => (
                      <li key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderTop: "1px dashed var(--color-divider)" }}>
                        <Link href={`/ogrenim/${c.slug}`} style={{ minWidth: 0 }}>{c.title}</Link>
                        <span style={{ whiteSpace: "nowrap", color: c.certificate_code ? "var(--color-accent-2-700)" : "var(--muted-55)", display: "flex", alignItems: "center", gap: 4 }}>
                          {c.certificate_code ? <><Check size={14} aria-hidden /> Tamamlandı</> : `%${c.percentage}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                    {m.program.is_published && <Link href={`/programlar/${m.program.slug}`} className="btn btn-primary blueprint" style={{ padding: "8px 18px" }}><Corners />Programı gör</Link>}
                    {m.certificate_code && <Link href={`/sertifika/${m.certificate_code}`} className="btn btn-secondary" style={{ padding: "8px 18px" }}>Program sertifikası</Link>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

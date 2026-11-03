import Link from "next/link";
import { JoinCompanyForm } from "@/components/company/JoinCompanyForm";
import { getMembership } from "@/lib/company";
import { listMyRequests } from "@/lib/company-seats";
import { formatDate } from "@/lib/format";

const STATUS = { pending: "Bekliyor", fulfilled: "Atandı", rejected: "Reddedildi" } as const;

/** Profil sayfasında şirket durumu: bağlı değilse katılma formu, onay bekliyorsa bilgi, bağlıysa şirket ve taleplerim. */
export async function CompanyCard({ userId }: { userId: number }) {
  const m = await getMembership(userId);
  const requests = m?.status === "active" ? await listMyRequests(userId) : [];
  return (
    <section className="card" style={{ background: "#fff", padding: 24, gap: 14, marginTop: 32 }}>
      <h2 style={{ fontSize: 28, textTransform: "uppercase", margin: 0 }}>Şirket</h2>
      {!m && (
        <>
          <p style={{ margin: 0, color: "var(--muted-72)" }}>Bir şirkete bağlıysanız şirket kodunu girin. Katılım, şirket yöneticisinin onayından sonra tamamlanır.</p>
          <JoinCompanyForm />
        </>
      )}
      {m?.status === "pending" && <p style={{ margin: 0 }}><strong>{m.companyName}</strong> şirketine katılma isteğiniz onay bekliyor. O zamana kadar bireysel hesap olarak devam edebilirsiniz.</p>}
      {m?.status === "active" && (
        <>
          <p style={{ margin: 0 }}>
            <strong>{m.companyName}</strong> şirketine bağlısınız{m.role === "admin" ? " (şirket yöneticisi)" : ""}. Şirkete bağlı hesaplar kendi başına kurs satın alamaz; eğitimleri şirket yöneticinizden talep edebilirsiniz.
          </p>
          {m.role === "admin" && <Link href="/sirket" className="btn btn-primary" style={{ alignSelf: "start" }}>Şirket paneli</Link>}
          {requests.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Taleplerim</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {requests.map((r) => <li key={r.id}>{r.courseTitle} — {STATUS[r.status]} <span style={{ color: "var(--muted-55)" }}>({formatDate(r.createdAt)})</span></li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Corners } from "@/components/Corners";
import { formatDate } from "@/lib/format";
import { getCertificateByCode } from "@/lib/lms";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cert = await getCertificateByCode(decodeURIComponent((await params).code));
  return cert
    ? { title: `${cert.student_name} — ${cert.course_title}`, description: `${cert.student_name}, ${cert.course_title} programını başarıyla tamamladı.` }
    : { title: "Sertifika bulunamadı", robots: { index: false } };
}

/** Herkese açık, salt okunur doğrulama sayfası (oturum gerektirmez). */
export default async function CertificatePage({ params }: Props) {
  const cert = await getCertificateByCode(decodeURIComponent((await params).code));
  if (!cert) notFound();

  return (
    <main className="grid-bg" style={{ padding: "clamp(40px,8vw,96px) 20px", minHeight: "70vh" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="eyebrow" style={{ textAlign: "center" }}>Doğrulanmış sertifika</div>
        <div className="blueprint elev-lg" style={{ background: "#fff", padding: 14 }}>
          <Corners />
          <div style={{ border: "1px solid var(--color-accent-300)", padding: "clamp(24px,5vw,48px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
              <Image src="/profect-logo.jpeg" alt="Profect" width={173} height={47} style={{ height: 34, width: "auto", mixBlendMode: "multiply" }} />
              <div style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted-55)" }}>No. {cert.certificate_code}</div>
            </div>
            <div style={{ fontSize: 13, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--color-accent-2)", fontWeight: 600, marginBottom: 10 }}>Başarı Sertifikası</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: "clamp(40px,7vw,64px)", lineHeight: 1, fontWeight: 600, marginBottom: 16 }}>{cert.student_name}</div>
            <p style={{ fontSize: 16, color: "var(--muted-72)", marginBottom: 28 }}>
              <strong style={{ fontWeight: 600 }}>{cert.course_title}</strong> programını tamamlamış
              {cert.score !== null && <> ve final sınavını %{cert.score} başarıyla geçmiştir</>}.
            </p>
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap", fontSize: 14 }}>
              <div><div style={{ color: "var(--muted-55)", fontSize: 12 }}>Tarih</div><strong style={{ fontWeight: 600 }}>{formatDate(cert.issued_at)}</strong></div>
              <div><div style={{ color: "var(--muted-55)", fontSize: 12 }}>Süre</div><strong style={{ fontWeight: 600 }}>{cert.course_hours} saat</strong></div>
              {cert.instructor && <div><div style={{ color: "var(--muted-55)", fontSize: 12 }}>Eğitmen</div><strong style={{ fontWeight: 600 }}>{cert.instructor}</strong></div>}
            </div>
          </div>
        </div>
        <p style={{ textAlign: "center", marginTop: 24, fontSize: 14, color: "var(--muted-55)" }}>
          Bu sayfa, sertifikanın Profect kayıtlarında bulunduğunu doğrular. <Link href="/#sertifika">Başka bir sertifika doğrula</Link>
        </p>
      </div>
    </main>
  );
}

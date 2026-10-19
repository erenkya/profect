import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { Download } from "lucide-react";
import { notFound } from "next/navigation";
import { Corners } from "@/components/Corners";
import { ShareCertificate } from "@/components/ShareCertificate";
import { Cta } from "@/components/Cta";
import { certificateQrSvg, certificateVerifyUrl } from "@/lib/certificate-pdf";
import { formatDate, formatDuration } from "@/lib/format";
import { getBaseUrlFromHeaders } from "@/lib/http";
import { getCertificateByCode } from "@/lib/lms";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cert = await getCertificateByCode(decodeURIComponent((await params).code));
  if (!cert) return { title: "Sertifika bulunamadı", robots: { index: false } };
  const base = getBaseUrlFromHeaders(await headers());
  const title = `${cert.student_name} — ${cert.course_title}`;
  const description = `${cert.student_name}, ${cert.course_title} programını başarıyla tamamladı.`;
  return {
    title,
    description,
    metadataBase: new URL(base),
    openGraph: { title, description, type: "website", siteName: "Profect", locale: "tr_TR", url: certificateVerifyUrl(base, cert.certificate_code) },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Herkese açık, salt okunur doğrulama sayfası (oturum gerektirmez). */
export default async function CertificatePage({ params }: Props) {
  const cert = await getCertificateByCode(decodeURIComponent((await params).code));
  if (!cert) notFound();
  const verifyUrl = certificateVerifyUrl(getBaseUrlFromHeaders(await headers()), cert.certificate_code);
  const qrSvg = await certificateQrSvg(verifyUrl);

  return (
    <>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 40, flexWrap: "wrap", fontSize: 14 }}>
                <div><div style={{ color: "var(--muted-55)", fontSize: 12 }}>Tarih</div><strong style={{ fontWeight: 600 }}>{formatDate(cert.issued_at)}</strong></div>
                <div><div style={{ color: "var(--muted-55)", fontSize: 12 }}>Süre</div><strong style={{ fontWeight: 600 }}>{formatDuration(cert.course_minutes)}</strong></div>
                {cert.instructor && <div><div style={{ color: "var(--muted-55)", fontSize: 12 }}>Eğitmen</div><strong style={{ fontWeight: 600 }}>{cert.instructor}</strong></div>}
              </div>
              <div style={{ textAlign: "center" }}>
                <div
                  role="img"
                  aria-label={`${cert.certificate_code} numaralı sertifikayı doğrulayan QR kod`}
                  style={{ width: 104, height: 104, padding: 6, border: "1px solid var(--color-divider)", boxSizing: "content-box" }}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-55)" }}>Doğrulamak için tara</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          <a className="btn btn-primary blueprint" href={`/api/public/certificates/${encodeURIComponent(cert.certificate_code)}/pdf`} download style={{ fontSize: 16, padding: "10px 22px" }}>
            <Corners />
            <Download size={18} aria-hidden /> PDF olarak indir
          </a>
        </div>
        <div style={{ marginTop: 32 }}>
          <ShareCertificate
            url={verifyUrl}
            text={`${cert.student_name}, ${cert.course_title} programını tamamladı ve Profect sertifikasını aldı.`}
            courseTitle={cert.course_title}
            certificateCode={cert.certificate_code}
            issueYear={Number(cert.issued_at.slice(0, 4))}
            issueMonth={Number(cert.issued_at.slice(5, 7))}
          />
        </div>
        <p style={{ textAlign: "center", marginTop: 32, fontSize: 14, color: "var(--muted-55)" }}>
          Bu sayfa, sertifikanın Profect kayıtlarında bulunduğunu doğrular. <Link href="/#sertifika">Başka bir sertifika doğrula</Link>
        </p>
      </div>
    </main>
    <Cta />
    </>
  );
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { formatDate } from "@/lib/format";
import { getCertificateByCode } from "@/lib/lms";

export const alt = "Profect başarı sertifikası";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontPath = (name: string) => path.join(process.cwd(), "src/assets/fonts", name);

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const cert = await getCertificateByCode(decodeURIComponent((await params).code));
  const [regular, semi, cond, logo] = await Promise.all([
    readFile(fontPath("Barlow-Regular.ttf")),
    readFile(fontPath("Barlow-SemiBold.ttf")),
    readFile(fontPath("BarlowCondensed-SemiBold.ttf")),
    readFile(path.join(process.cwd(), "public/profect-logo.jpeg")),
  ]);
  const logoSrc = `data:image/jpeg;base64,${logo.toString("base64")}`;
  const name = cert?.student_name ?? "Sertifika bulunamadı";
  const nameSize = name.length > 22 ? 96 : 128;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#eef2fe", padding: 28, fontFamily: "Barlow", color: "#17142b" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fff", border: "2px solid #3a5fdc", padding: "52px 64px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" width={236} height={64} />
            {cert && <div style={{ fontSize: 24, letterSpacing: 3, color: "#77767f", textTransform: "uppercase" }}>{`No. ${cert.certificate_code}`}</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, letterSpacing: 6, fontWeight: 600, color: "#4a2a9e", textTransform: "uppercase" }}>Başarı Sertifikası</div>
            <div style={{ fontFamily: "Barlow Condensed", fontWeight: 600, fontSize: nameSize, lineHeight: 1.05, marginTop: 8 }}>{name}</div>
            {cert && (
              <div style={{ display: "flex", flexWrap: "wrap", fontSize: 34, marginTop: 20, color: "#17142b" }}>
                <span style={{ fontWeight: 600, marginRight: 10 }}>{cert.course_title}</span>
                <span>programını tamamladı.</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#77767f" }}>
            <span>{cert ? formatDate(cert.issued_at) : ""}</span>
            <span>Profect · Doğrulanabilir sertifika</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Barlow", data: regular, weight: 400, style: "normal" },
        { name: "Barlow", data: semi, weight: 600, style: "normal" },
        { name: "Barlow Condensed", data: cond, weight: 600, style: "normal" },
      ],
    },
  );
}

import { buildCertificatePdf, certificateVerifyUrl } from "@/lib/certificate-pdf";
import { fail, getBaseUrl, serverError } from "@/lib/http";
import { getCertificateByCode } from "@/lib/lms";

/** Herkese açık sertifika PDF'i (sayfa gibi numarayı bilen herkes indirebilir). */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(code)) return fail("Geçersiz sertifika numarası.", 400);
  try {
    const cert = await getCertificateByCode(code);
    if (!cert) return fail("Bu numarayla kayıtlı bir sertifika bulunamadı.", 404);
    const pdf = await buildCertificatePdf(cert, certificateVerifyUrl(getBaseUrl(request), cert.certificate_code));
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="profect-sertifika-${cert.certificate_code}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return serverError("[GET /api/public/certificates/:code/pdf]", err);
  }
}

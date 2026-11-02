import { fail, ok, serverError } from "@/lib/http";
import { getCertificateByCode } from "@/lib/lms";

/** Herkese açık, salt okunur doğrulama. Yalnızca ad, kurs/program, tarih, süre ve puan döner (program sertifikasında `score` null, `course_title` program adı). */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(code)) return fail("Geçersiz sertifika numarası.", 400);
  try {
    const cert = await getCertificateByCode(code);
    if (!cert) return fail("Bu numarayla kayıtlı bir sertifika bulunamadı.", 404);
    // Alanlar tek tek seçilir: eğitmen, kurs listesi gibi dahili alanlar sızmasın.
    return ok({
      data: {
        kind: cert.kind,
        certificate_code: cert.certificate_code,
        issued_at: cert.issued_at,
        score: cert.score,
        student_name: cert.student_name,
        course_title: cert.course_title,
        course_minutes: cert.course_minutes,
      },
    });
  } catch (err) {
    return serverError("[GET /api/public/certificates/:code]", err);
  }
}

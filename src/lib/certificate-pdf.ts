import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDate } from "@/lib/format";
import type { CertificateRow } from "@/lib/lms";

export function certificateVerifyUrl(baseUrl: string, code: string): string {
  return `${baseUrl}/sertifika/${encodeURIComponent(code)}`;
}

/** Ekranda gösterilen QR (inline SVG). */
export function certificateQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#17142b", light: "#0000" } });
}

const TEXT = rgb(0x17 / 255, 0x14 / 255, 0x2b / 255);
const MUTED = rgb(0.45, 0.44, 0.5);
const ACCENT = rgb(0x3a / 255, 0x5f / 255, 0xdc / 255);
const ACCENT_BORDER = rgb(0xb9 / 255, 0xc9 / 255, 0xfb / 255);
const PURPLE = rgb(0x4a / 255, 0x2a / 255, 0x9e / 255);

const fontPath = (name: string) => path.join(process.cwd(), "src/assets/fonts", name);

/** pdf-lib karakter aralığı desteklemez; büyük harfli etiketler için elle aralık verir. */
function drawSpaced(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, spacing: number, color = TEXT) {
  let cx = x;
  for (const ch of text) {
    page.drawText(ch, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(ch, size) + spacing;
  }
}

function spacedWidth(text: string, font: PDFFont, size: number, spacing: number) {
  return [...text].reduce((w, ch) => w + font.widthOfTextAtSize(ch, size) + spacing, 0) - spacing;
}

export async function buildCertificatePdf(cert: CertificateRow, verifyUrl: string): Promise<Uint8Array> {
  const [regularBytes, semiBytes, condBytes, logoBytes] = await Promise.all([
    readFile(fontPath("Barlow-Regular.ttf")),
    readFile(fontPath("Barlow-SemiBold.ttf")),
    readFile(fontPath("BarlowCondensed-SemiBold.ttf")),
    readFile(path.join(process.cwd(), "public/profect-logo.jpeg")),
  ]);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${cert.student_name} — ${cert.course_title}`);
  pdf.setAuthor("Profect");
  pdf.setSubject(`Başarı Sertifikası ${cert.certificate_code}`);

  const regular = await pdf.embedFont(regularBytes, { subset: true });
  const semi = await pdf.embedFont(semiBytes, { subset: true });
  const cond = await pdf.embedFont(condBytes, { subset: true });
  const logo = await pdf.embedJpg(logoBytes);

  const W = 841.89;
  const H = 595.28;
  const page = pdf.addPage([W, H]);

  // Çerçeveler
  const m = 28;
  page.drawRectangle({ x: m, y: m, width: W - 2 * m, height: H - 2 * m, borderColor: ACCENT, borderWidth: 1 });
  const m2 = 40;
  page.drawRectangle({ x: m2, y: m2, width: W - 2 * m2, height: H - 2 * m2, borderColor: ACCENT_BORDER, borderWidth: 1 });
  const L = 18; // köşe işaretleri
  for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + dx * L, y: cy }, thickness: 2.5, color: PURPLE });
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + dy * L }, thickness: 2.5, color: PURPLE });
  }

  const px = 76;
  const right = W - px;

  // Üst şerit: logo + numara
  const logoH = 38;
  page.drawImage(logo, { x: px, y: H - 76 - logoH, width: (logo.width / logo.height) * logoH, height: logoH });
  const no = `No. ${cert.certificate_code}`;
  const noW = spacedWidth(no.toUpperCase(), regular, 10, 1.4);
  drawSpaced(page, no.toUpperCase(), right - noW, H - 98, regular, 10, 1.4, MUTED);

  // Başlık + isim
  drawSpaced(page, "BAŞARI SERTİFİKASI", px, H - 168, semi, 12, 3, PURPLE);
  let nameSize = 64;
  while (nameSize > 28 && cond.widthOfTextAtSize(cert.student_name, nameSize) > right - px) nameSize -= 2;
  page.drawText(cert.student_name, { x: px, y: H - 168 - 18 - nameSize * 0.8, size: nameSize, font: cond, color: TEXT });

  // Açıklama
  let y = H - 168 - 18 - nameSize * 0.8 - 38;
  const size = 15;
  const tail = cert.score !== null
    ? ` programını tamamlamış ve final sınavını %${cert.score} başarıyla geçmiştir.`
    : " programını tamamlamıştır.";
  // Kurs adı kalın: önce tüm cümleyi satırlara böl, kurs adı geçen kelimeleri kalın çiz.
  const courseWords = new Set(cert.course_title.split(/\s+/));
  const words = (cert.course_title + tail).split(/\s+/);
  const maxW = right - px - 180; // QR için sağda boşluk
  let line: string[] = [];
  const lineW = (ws: string[]) => ws.reduce((w, t, i) => w + (courseWords.has(t) ? semi : regular).widthOfTextAtSize(t, size) + (i ? regular.widthOfTextAtSize(" ", size) : 0), 0);
  const flush = () => {
    let x = px;
    for (const t of line) {
      const f = courseWords.has(t) ? semi : regular;
      page.drawText(t, { x, y, size, font: f, color: TEXT });
      x += f.widthOfTextAtSize(t + " ", size);
    }
    y -= size * 1.55;
    line = [];
  };
  for (const w of words) {
    if (line.length && lineW([...line, w]) > maxW) flush();
    line.push(w);
  }
  if (line.length) flush();

  // Alt bilgiler
  const infoY = 92;
  const infos: [string, string][] = [["TARİH", formatDate(cert.issued_at)], ["SÜRE", `${cert.course_hours} saat`]];
  if (cert.instructor) infos.push(["EĞİTMEN", cert.instructor]);
  let ix = px;
  for (const [label, value] of infos) {
    drawSpaced(page, label, ix, infoY + 18, regular, 8.5, 1.6, MUTED);
    page.drawText(value, { x: ix, y: infoY, size: 13, font: semi, color: TEXT });
    ix += Math.max(semi.widthOfTextAtSize(value, 13), spacedWidth(label, regular, 8.5, 1.6)) + 40;
  }

  // QR (vektör)
  const qr = QRCode.create(verifyUrl, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const qrSize = 104;
  const cell = qrSize / n;
  const qx = right - qrSize;
  const qy = infoY - 6;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      // +0.2 taşma: hücreler arası ince beyaz çizgileri önler
      page.drawRectangle({ x: qx + c * cell, y: qy + qrSize - (r + 1) * cell, width: cell + 0.2, height: cell + 0.2, color: TEXT });
    }
  }
  const caption = "Doğrulamak için tara";
  page.drawText(caption, { x: qx + (qrSize - regular.widthOfTextAtSize(caption, 8.5)) / 2, y: qy - 14, size: 8.5, font: regular, color: MUTED });
  const host = verifyUrl.replace(/^https?:\/\//, "");
  const hostSize = 7.5;
  page.drawText(host, { x: right - regular.widthOfTextAtSize(host, hostSize), y: qy - 26, size: hostSize, font: regular, color: MUTED });

  return pdf.save();
}

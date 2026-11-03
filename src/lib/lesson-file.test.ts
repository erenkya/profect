import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LESSON_FILE_BYTES,
  buildLessonFileKey,
  cleanFileName,
  contentDispositionAttachment,
  fileExtension,
  formatFileSize,
  isBlockedFileName,
  isLessonFileKey,
  lessonFileKeyForLesson,
} from "./lesson-file.ts";

const KEY = "dosyalar/7/a1b2c3d4-sunum.pptx";

test("MAX_LESSON_FILE_BYTES 150 MiB'dır", () => {
  assert.equal(MAX_LESSON_FILE_BYTES, 157_286_400);
});

test("fileExtension son uzantıyı küçük harfle ve noktasız döner", () => {
  assert.equal(fileExtension("A.PDF"), "pdf");
  assert.equal(fileExtension("rapor.pdf.exe"), "exe");
  assert.equal(fileExtension("run"), "");
  assert.equal(fileExtension(".gitignore"), "");
});

test("isBlockedFileName çalıştırılabilir uzantıları yakalar (büyük harf, çift uzantı, sondaki nokta/boşluk)", () => {
  for (const name of ["SETUP.EXE", "rapor.pdf.exe", "a.sh", "x.exe.", "x.exe ", "kur.msi", "a.ps1", "x.jar", "y.apk", "z.dmg", "k.app"]) {
    assert.ok(isBlockedFileName(name), name);
  }
  for (const name of ["sunum.pptx", "kod.zip", "main.py", "run", "exe", "notlar.txt"]) {
    assert.ok(!isBlockedFileName(name), name);
  }
});

test("cleanFileName yol ayırıcıları ve kontrol karakterlerini atar, uzantıyı korur", () => {
  assert.equal(cleanFileName("..\\..\\evil.txt"), "evil.txt");
  assert.equal(cleanFileName("a/b/c.pdf"), "c.pdf");
  assert.ok(!/[\r\n]/.test(cleanFileName("x\r\ny.pdf")));
  const long = cleanFileName(`${"a".repeat(300)}.pdf`);
  assert.equal(long.length, 255);
  assert.ok(long.endsWith(".pdf"));
  assert.equal(cleanFileName("   "), "dosya");
});

test("buildLessonFileKey ders klasörü, rastgele önek, ASCII slug ve uzantıyla anahtar üretir", () => {
  assert.equal(buildLessonFileKey(7, "Hafta 3 Sunumu.PPTX", "a1b2c3d4"), "dosyalar/7/a1b2c3d4-hafta-3-sunumu.pptx");
  assert.equal(buildLessonFileKey(7, "Makefile", "a1b2c3d4"), "dosyalar/7/a1b2c3d4-makefile");
  assert.equal(buildLessonFileKey(7, "Çalışma Şablonu.zip", "a1b2c3d4"), "dosyalar/7/a1b2c3d4-calisma-sablonu.zip");
  assert.equal(buildLessonFileKey(7, "???.pdf", "a1b2c3d4"), "dosyalar/7/a1b2c3d4-dosya.pdf");
});

test("isLessonFileKey biçimi doğrular, traversal ve başka klasörleri reddeder", () => {
  assert.ok(isLessonFileKey(KEY));
  for (const bad of ["", "dosyalar/7/../x", "dosyalar/x/a1b2c3d4-a.pdf", "kurslar/a/1-b/a1b2c3d4-c.mp4", "dosyalar/7/A1B2C3D4-a.pdf", ` ${KEY}`, `${KEY}/extra`]) {
    assert.ok(!isLessonFileKey(bad), bad);
  }
});

test("lessonFileKeyForLesson ders ID'sini tam sayı olarak eşler", () => {
  assert.ok(lessonFileKeyForLesson(KEY, 7));
  assert.ok(!lessonFileKeyForLesson(KEY, 70));
  assert.ok(!lessonFileKeyForLesson(KEY, 1));
  assert.ok(!lessonFileKeyForLesson("dosyalar/7/../x", 7));
});

test("contentDispositionAttachment başlığı güvenli ve tek satırdır", () => {
  const h = contentDispositionAttachment('Rapor "Q1"; ş.pdf');
  assert.ok(h.startsWith("attachment;"));
  assert.ok(h.includes("filename*=UTF-8''"));
  assert.ok(h.includes("%C5%9F"));
  assert.ok(!/[\r\n]/.test(h));
  assert.match(h, /^attachment; filename="[^"\\;]*"; filename\*=UTF-8''[A-Za-z0-9%._~-]*$/); // yedek ad tırnak/;/\ içermez, UTF-8 adı yüzde kodlu
  const crlf = contentDispositionAttachment("a\r\nSet-Cookie: x=1.pdf");
  assert.ok(!/[\r\n]/.test(crlf));
});

test("formatFileSize Türkçe ondalık virgülle biçimler", () => {
  assert.equal(formatFileSize(850), "850 B");
  assert.equal(formatFileSize(1536), "1,5 KB");
  assert.equal(formatFileSize(2_516_582), "2,4 MB");
});

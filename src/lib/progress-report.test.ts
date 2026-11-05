import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProgressRow, QuizResult } from "./company-seats.ts";
import { QUIZ_HEADERS, REPORT_HEADERS, finalScore, parseUserIds, quizOutcome, quizRows, reportFileName, reportRow, selectRows } from "./progress-report.ts";

const row = (o: Partial<ProgressRow> = {}): ProgressRow => ({
  assignmentId: 1, userId: 7, userName: "Ayşe Yılmaz", userEmail: "ayse@acme.com", courseId: 2, courseTitle: "İSG Temel",
  completedLessons: 3, totalLessons: 4, percentage: 75, status: "in_progress", certificateCode: null,
  dueAt: null, courseDueAt: null, effectiveDueAt: null, assignedAt: "2026-11-01 09:00:00", lastActivityAt: "2026-11-03 18:30:00", quizzes: [], ...o,
});
const quiz = (o: Partial<QuizResult> = {}): QuizResult => ({
  quizId: 1, title: "Final Sınavı", moduleTitle: null, passingScore: 70, attempts: 2, bestScore: 85, lastScore: 60, passed: true, lastAttemptAt: "2026-11-04 09:00:00", ...o,
});
const NOW = Date.parse("2026-11-05T12:00:00Z");

test("parseUserIds: boş hepsi, geçersiz parça undefined, tekrarlar silinir", () => {
  assert.equal(parseUserIds(null), null);
  assert.equal(parseUserIds("  "), null);
  assert.deepEqual(parseUserIds("3,5, 3,8"), [3, 5, 8]);
  assert.equal(parseUserIds("3,abc"), undefined);
  assert.equal(parseUserIds("3,,5"), undefined);
  assert.equal(parseUserIds("-1"), undefined);
  assert.equal(parseUserIds("1.5"), undefined);
});

test("selectRows: seçilenleri süzer, null hepsini verir, tanımsız kimliği yok sayar", () => {
  const rows = [row({ userId: 1, assignmentId: 1 }), row({ userId: 2, assignmentId: 2 }), row({ userId: 1, assignmentId: 3 })];
  assert.equal(selectRows(rows, null).length, 3);
  assert.deepEqual(selectRows(rows, [1]).map((r) => r.assignmentId), [1, 3]);
  assert.deepEqual(selectRows(rows, [99]), []);
});

test("reportRow: sütun sayısı başlıkla aynı; yüzde, durum ve Türkiye saati", () => {
  const cells = reportRow(row(), NOW);
  assert.equal(cells.length, REPORT_HEADERS.length);
  assert.equal(cells[5], 75);
  assert.equal(cells[6], "Devam ediyor");
  assert.deepEqual(cells.slice(7, 10), [0, 0, "—"]);
  assert.match(String(cells[10]), /1 Kas 2026/);
  assert.equal(cells[12], "—");
  assert.equal(cells[13], "—");
});

test("reportRow: ders yoksa %0; son tarih geçmişse 'Süresi doldu', tamamlayana '—'", () => {
  assert.equal(reportRow(row({ totalLessons: 0, completedLessons: 0, percentage: 0, status: "not_started" }), NOW)[5], 0);
  assert.equal(reportRow(row({ percentage: 55 }), NOW)[5], 55);
  const late = { effectiveDueAt: "2026-11-04 10:00:00" };
  assert.equal(reportRow(row(late), NOW)[13], "Süresi doldu");
  assert.equal(reportRow(row({ ...late, status: "completed", certificateCode: "C-1" }), NOW)[13], "—");
  assert.equal(reportRow(row({ status: "completed", certificateCode: "C-1" }), NOW)[14], "C-1");
});

test("reportFileName: Türkçe karakterleri sadeleştirir", () => {
  assert.equal(reportFileName("Çağrı Şirketi A.Ş.", new Date("2026-11-05T10:00:00Z")), "ilerleme-raporu-cagri-sirketi-a-s-2026-11-05.xlsx");
  assert.equal(reportFileName("###", new Date("2026-11-05T10:00:00Z")), "ilerleme-raporu-2026-11-05.xlsx");
});

test("sınav özeti: geçilen sayısı, final puanı ve sonuç etiketi", () => {
  const quizzes = [quiz({ quizId: 1, title: "Modül 1", moduleTitle: "Giriş", bestScore: 50, passed: false }), quiz({ quizId: 2 }), quiz({ quizId: 3, moduleTitle: "Son", attempts: 0, bestScore: null, lastScore: null, passed: false, lastAttemptAt: null })];
  const cells = reportRow(row({ quizzes }), NOW);
  assert.deepEqual(cells.slice(7, 10), [1, 3, 85]);
  assert.equal(finalScore(quizzes), 85);
  assert.equal(finalScore([quiz({ attempts: 0, bestScore: null })]), null);
  assert.deepEqual(quizzes.map(quizOutcome), ["Kaldı", "Geçti", "Girmedi"]);
});

test("quizRows: her atamanın her sınavı bir satır, sütunlar başlıkla aynı", () => {
  const out = quizRows([row({ quizzes: [quiz({ moduleTitle: "Giriş", title: "Modül 1" }), quiz({ attempts: 0, bestScore: null, lastScore: null, passed: false, lastAttemptAt: null })] }), row({ userId: 9 })]);
  assert.equal(out.length, 2);
  assert.equal(out[0].length, QUIZ_HEADERS.length);
  assert.equal(out[0][4], "Modül sınavı: Giriş");
  assert.equal(out[0][7], 85);
  assert.deepEqual(out[1].slice(4), ["Final sınavı", 70, 0, "—", "—", "—", "Girmedi"]);
});

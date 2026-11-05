// Şirket admininin indirdiği eğitim ilerleme raporunun saf (DB/ağ içermeyen) kuralları: kişi seçimi, satır ve dosya adı üretimi.
// `server-only` içermez; node --test ile doğrudan yüklenebilir.
import type { ProgressRow, QuizResult } from "./company-seats.ts";
import { dueState, formatIstanbul } from "./due-rules.ts";

export const REPORT_SHEET = "İlerleme";
export const REPORT_HEADERS = [
  "Çalışan", "E-posta", "Eğitim", "Tamamlanan ders", "Toplam ders", "İlerleme (%)", "Durum",
  "Geçilen sınav", "Toplam sınav", "Final sınavı puanı (%)",
  "Atanma tarihi", "Son aktivite", "Son tarih", "Süre durumu", "Sertifika kodu",
] as const;
/** Sütun genişlikleri (karakter); `REPORT_HEADERS` ile aynı sırada. */
export const REPORT_WIDTHS = [24, 30, 36, 16, 12, 13, 14, 14, 13, 20, 20, 20, 20, 16, 20] as const;

export const QUIZ_SHEET = "Sınav sonuçları";
export const QUIZ_HEADERS = [
  "Çalışan", "E-posta", "Eğitim", "Sınav", "Tür", "Geçme notu (%)", "Deneme sayısı", "En yüksek puan (%)", "Son puan (%)", "Son deneme", "Sonuç",
] as const;
export const QUIZ_WIDTHS = [24, 30, 36, 40, 28, 14, 13, 18, 13, 20, 12] as const;

const STATUS_LABEL = { not_started: "Başlamadı", in_progress: "Devam ediyor", completed: "Tamamlandı" } as const;
const DUE_LABEL = { none: "—", ok: "Süresi var", soon: "Yaklaşıyor", overdue: "Süresi doldu" } as const;

/** `?users=3,5,8` → [3, 5, 8]. Boş/yoksa `null` (hepsi); geçersiz bir parça varsa `undefined` (istek hatalı). */
export function parseUserIds(raw: string | null): number[] | null | undefined {
  if (raw === null || raw.trim() === "") return null;
  const ids = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n <= 0) return undefined;
    ids.add(n);
  }
  return [...ids];
}

/** Seçili kişilerin satırları (sıra korunur); `userIds` null ise tümü. Şirket dışı bir kimlik sessizce elenir, çünkü `rows` zaten şirketindir. */
export function selectRows(rows: ProgressRow[], userIds: number[] | null): ProgressRow[] {
  if (userIds === null) return rows;
  const wanted = new Set(userIds);
  return rows.filter((r) => wanted.has(r.userId));
}

export const quizzesPassed = (quizzes: QuizResult[]): number => quizzes.filter((q) => q.passed).length;

/** Final sınavının en yüksek puanı; final yoksa ya da girilmediyse null. */
export const finalScore = (quizzes: QuizResult[]): number | null => quizzes.find((q) => q.moduleTitle === null)?.bestScore ?? null;

/** Sınavın sonuç etiketi: hiç girilmediyse "Girmedi", bir denemede geçtiyse "Geçti", aksi halde "Kaldı". */
export const quizOutcome = (q: QuizResult): "Geçti" | "Kaldı" | "Girmedi" => (q.attempts === 0 ? "Girmedi" : q.passed ? "Geçti" : "Kaldı");

/** Bir ilerleme satırının Excel hücre değerleri; `REPORT_HEADERS` ile aynı sırada. */
export function reportRow(r: ProgressRow, nowMs: number): (string | number)[] {
  return [
    r.userName,
    r.userEmail,
    r.courseTitle,
    r.completedLessons,
    r.totalLessons,
    r.percentage,
    STATUS_LABEL[r.status],
    quizzesPassed(r.quizzes),
    r.quizzes.length,
    finalScore(r.quizzes) ?? "—",
    formatIstanbul(r.assignedAt),
    r.lastActivityAt ? formatIstanbul(r.lastActivityAt) : "—",
    r.effectiveDueAt ? formatIstanbul(r.effectiveDueAt) : "—",
    // Tamamlayan için "süresi doldu" anlamsız.
    r.status === "completed" ? "—" : DUE_LABEL[dueState(r.effectiveDueAt, nowMs)],
    r.certificateCode ?? "—",
  ];
}

/** "Sınav sonuçları" sayfasının satırları: her atamanın her sınavı için bir satır; `QUIZ_HEADERS` ile aynı sırada. */
export function quizRows(rows: ProgressRow[]): (string | number)[][] {
  return rows.flatMap((r) =>
    r.quizzes.map((q) => [
      r.userName,
      r.userEmail,
      r.courseTitle,
      q.title,
      q.moduleTitle ? `Modül sınavı: ${q.moduleTitle}` : "Final sınavı",
      q.passingScore,
      q.attempts,
      q.bestScore ?? "—",
      q.lastScore ?? "—",
      q.lastAttemptAt ? formatIstanbul(q.lastAttemptAt) : "—",
      quizOutcome(q),
    ]),
  );
}

/** "ilerleme-raporu-acme-a-s-2026-11-05.xlsx": ASCII'ye indirilmiş, güvenli dosya adı. */
export function reportFileName(companyName: string, now: Date): string {
  const slug = companyName
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `ilerleme-raporu${slug ? `-${slug}` : ""}-${now.toISOString().slice(0, 10)}.xlsx`;
}

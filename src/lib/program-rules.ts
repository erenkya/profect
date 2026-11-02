// Program kurallarının saf (DB/ağ içermeyen) kısmı. `server-only` içermez; node --test ile yüklenebilir.

/** Programın tamamlanmış sayılması: tüm kursları sertifikalı. Kursu olmayan program asla tamamlanmış sayılmaz. */
export function isProgramComplete(courseIds: readonly number[], certifiedCourseIds: ReadonlySet<number>): boolean {
  return courseIds.length > 0 && courseIds.every((id) => certifiedCourseIds.has(id));
}

/** `generateCertificateCode` (lms.ts) ile aynı kalıp; program sertifikası için `PRP-` öneki. */
export function generateProgramCertificateCode(
  year: number = new Date().getFullYear(),
  rand: () => number = Math.random,
): string {
  const n = Math.floor(rand() * 1_000_000).toString().padStart(6, "0");
  return `PRP-${year}-${n}`;
}

export type CourseEligibility = {
  id: number;
  title: string;
  price: number;
  is_published: boolean;
  has_final_quiz: boolean;
};

/** Programa eklenecek / yayına alınacak kursların sorunları (boşsa uygun). */
export function courseProblems(courses: readonly CourseEligibility[]): string[] {
  if (courses.length === 0) return ["Programda en az bir kurs olmalı."];
  const problems: string[] = [];
  for (const c of courses) {
    if (!c.is_published) problems.push(`“${c.title}” kursu yayında değil.`);
    if (!c.has_final_quiz) problems.push(`“${c.title}” kursunun soru içeren bir final sınavı yok.`);
  }
  return problems;
}

/** Program fiyatı kursların toplamından yüksekse mesaj, değilse `null`. */
export function priceProblem(programPrice: number, courses: readonly CourseEligibility[]): string | null {
  const sum = Math.round(courses.reduce((s, c) => s + c.price, 0) * 100) / 100;
  if (programPrice > sum) return `Program fiyatı (${programPrice}) kursların toplamından (${sum}) yüksek olamaz.`;
  return null;
}

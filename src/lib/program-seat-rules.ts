// Program kontenjanı ve toplu atamanın saf (DB/ağ içermeyen) kuralları. company-rules.ts'ten ayrı dosyadır: dev sunucusu (Turbopack),
// çalışırken mevcut bir modüle eklenen yeni export'ları görmüyor; yeni modül taze yüklenir. `server-only` içermez; node --test ile yüklenebilir.
import type { AssignBlockReason } from "./company-rules.ts";

// ── Program kontenjanı ────────────────────────────────────────────────────────
export type ProgramAssignBlockReason = "not_member" | "burned" | "already_member" | "no_free" | "empty_program";

/** Program atamasının engeli (null = verilebilir). Sıra: not_member → empty_program → burned → already_member → no_free. */
export function programAssignBlock(i: { free: number; member: "active" | "other"; burned: boolean; alreadyProgramMember: boolean; courseCount: number }): ProgramAssignBlockReason | null {
  if (i.member !== "active") return "not_member";
  if (i.courseCount <= 0) return "empty_program";
  if (i.burned) return "burned";
  if (i.alreadyProgramMember) return "already_member";
  if (i.free <= 0) return "no_free";
  return null;
}

export const PROGRAM_ASSIGN_BLOCK_MESSAGES: Record<ProgramAssignBlockReason, string> = {
  not_member: "Bu kullanıcı şirketin onaylı bir üyesi değil.",
  burned: "Bu kullanıcı için bu programın hakkı yanmış; yeniden verilemez.",
  already_member: "Bu kullanıcı bu programa zaten üye.",
  no_free: "Bu program için boş kontenjan yok.",
  empty_program: "Bu programın kursu olmadığı için atanamaz.",
};

/**
 * Program geri alınınca silinecek kurs kayıtları: programın kurslarından `company` kaynaklı olanlar, ama çalışanda hâlâ aktif başka bir
 * şirket ataması (kurs ya da başka program) tarafından karşılananlar hariç. Başka kaynaklı kayıtlar (satın alma/hediye/admin) zaten `companySourced`'a girmez.
 */
export function releasableCourseIds(i: { programCourseIds: readonly number[]; companySourced: ReadonlySet<number>; coveredElsewhere: ReadonlySet<number> }): number[] {
  return i.programCourseIds.filter((id) => i.companySourced.has(id) && !i.coveredElsewhere.has(id));
}

export const programSeatOrderTitle = (title: string, quantity: number): string => `${title} · ${quantity} kişilik program kontenjanı`;

// ── Toplu atama ───────────────────────────────────────────────────────────────
export const BULK_MAX_ITEMS = 500;

export type BulkItem = { userId: number; courseId: number; programId?: undefined } | { userId: number; programId: number; courseId?: undefined };
export type BulkFailureReason = AssignBlockReason | ProgramAssignBlockReason | "invalid";
export type BulkResult = { item: BulkItem; ok: true } | { item: BulkItem; ok: false; reason: BulkFailureReason };

/** Aynı (kullanıcı, tür, id) bir kez sayılır; sıra korunur. Kurs 5 ile program 5 ayrı kutucuktur. */
export function dedupeBulkItems(items: readonly BulkItem[]): BulkItem[] {
  const seen = new Set<string>();
  const out: BulkItem[] = [];
  for (const it of items) {
    const key = it.programId !== undefined ? `${it.userId}:p:${it.programId}` : `${it.userId}:c:${it.courseId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export function summarizeBulk(results: readonly BulkResult[]): { assigned: number; failures: Extract<BulkResult, { ok: false }>[] } {
  const failures = results.filter((r): r is Extract<BulkResult, { ok: false }> => !r.ok);
  return { assigned: results.length - failures.length, failures };
}

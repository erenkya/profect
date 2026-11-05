import "server-only";
import { assignProgramSeat } from "@/lib/company-program-seats";
import { ASSIGN_BLOCK_MESSAGES } from "@/lib/company-rules";
import { assignSeat } from "@/lib/company-seats";
import { dedupeBulkItems, PROGRAM_ASSIGN_BLOCK_MESSAGES, type BulkFailureReason, type BulkItem, type BulkResult } from "@/lib/program-seat-rules";

/** Başarısız kutucuğun kullanıcıya gösterilecek Türkçe nedeni. */
export function bulkFailureMessage(item: BulkItem, reason: BulkFailureReason): string {
  if (reason === "invalid") return "Bu atama yapılamadı.";
  if (item.programId !== undefined) return PROGRAM_ASSIGN_BLOCK_MESSAGES[reason as keyof typeof PROGRAM_ASSIGN_BLOCK_MESSAGES] ?? "Bu atama yapılamadı.";
  return ASSIGN_BLOCK_MESSAGES[reason as keyof typeof ASSIGN_BLOCK_MESSAGES] ?? "Bu atama yapılamadı.";
}

/**
 * Seçilen kutucukları sırayla atar (tekrarlar tek sayılır). Her kutucuk `assignSeat`/`assignProgramSeat`'in kendi transaction'ı ve şirket kilidiyle
 * çalışır; bu yüzden kısmi başarı mümkündür ve eş zamanlı isteklerde kontenjan aşılmaz. Beklenmeyen hata yalnızca o kutucuğu `invalid` yapar.
 * `dueAt` (UTC metni) yalnızca KURS atamalarına uygulanır; programlarda son tarih yoktur.
 */
export async function applyBulkAssignments(i: { companyId: number; actorId: number; items: readonly BulkItem[]; dueAt?: string | null }): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  for (const item of dedupeBulkItems(i.items)) {
    try {
      const r =
        item.programId !== undefined
          ? await assignProgramSeat({ companyId: i.companyId, programId: item.programId, userId: item.userId, assignedBy: i.actorId })
          : await assignSeat({ companyId: i.companyId, courseId: item.courseId, userId: item.userId, assignedBy: i.actorId, dueAt: i.dueAt ?? null });
      results.push(r.ok ? { item, ok: true } : { item, ok: false, reason: r.reason });
    } catch (err) {
      console.error("[bulk-assign]", err);
      results.push({ item, ok: false, reason: "invalid" });
    }
  }
  return results;
}

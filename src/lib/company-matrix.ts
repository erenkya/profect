import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { cellKey } from "@/lib/assign-matrix";
import type { ProgramSeatSummary } from "@/lib/company-program-seats";
import type { SeatSummary } from "@/lib/company-seats";

export type MatrixColumn = { key: string; kind: "course" | "program"; id: number; title: string; free: number };
export type MatrixCellServer = "assigned" | "burned" | "owned";
/** `cells` anahtarı `cellKey(userId, columnKey)`; eksik hücre = atanabilir (açık). */
export type AssignMatrixData = { columns: MatrixColumn[]; cells: Record<string, MatrixCellServer> };

/**
 * Toplu atama matrisinin sunucu durumu. Sütunlar: kontenjanı olan kurslar (ada göre) sonra programlar. Hücre: `assigned` = aktif şirket ataması,
 * `burned` = yanmış, `owned` = çalışanın o kursa/programa başka yoldan sahip olması. Sorgular çalışan sayısından bağımsız, sabit adettedir (N+1 yok).
 */
export async function getAssignMatrix(i: { companyId: number; memberUserIds: readonly number[]; seats: readonly SeatSummary[]; programSeats: readonly ProgramSeatSummary[] }): Promise<AssignMatrixData> {
  const courseCols: MatrixColumn[] = i.seats.filter((s) => s.total > 0).sort((a, b) => a.courseTitle.localeCompare(b.courseTitle, "tr")).map((s) => ({ key: `c:${s.courseId}`, kind: "course", id: s.courseId, title: s.courseTitle, free: s.free }));
  const programCols: MatrixColumn[] = i.programSeats.filter((s) => s.total > 0).sort((a, b) => a.programTitle.localeCompare(b.programTitle, "tr")).map((s) => ({ key: `p:${s.programId}`, kind: "program", id: s.programId, title: s.programTitle, free: s.free }));
  const columns = [...courseCols, ...programCols];
  const cells: Record<string, MatrixCellServer> = {};
  if (columns.length === 0 || i.memberUserIds.length === 0) return { columns, cells };

  const users = [...i.memberUserIds];
  const courseIds = courseCols.map((c) => c.id), programIds = programCols.map((c) => c.id);
  const [ownedCourses, ownedPrograms, ca, pa] = await Promise.all([
    courseIds.length ? pool.query<RowDataPacket[]>("SELECT user_id, course_id FROM enrollments WHERE user_id IN (?) AND course_id IN (?)", [users, courseIds]) : [[]],
    programIds.length ? pool.query<RowDataPacket[]>("SELECT user_id, program_id FROM program_enrollments WHERE user_id IN (?) AND program_id IN (?)", [users, programIds]) : [[]],
    courseIds.length ? pool.query<RowDataPacket[]>("SELECT user_id, course_id, status FROM company_assignments WHERE company_id = ? AND status IN ('active','burned') AND course_id IN (?)", [i.companyId, courseIds]) : [[]],
    programIds.length ? pool.query<RowDataPacket[]>("SELECT user_id, program_id, status FROM company_program_assignments WHERE company_id = ? AND status IN ('active','burned') AND program_id IN (?)", [i.companyId, programIds]) : [[]],
  ]);
  // Öncelik: assigned > burned > owned (şirket ataması yoksa başka yoldan sahiplik).
  for (const r of ownedCourses[0] as RowDataPacket[]) cells[cellKey(r.user_id, `c:${r.course_id}`)] = "owned";
  for (const r of ownedPrograms[0] as RowDataPacket[]) cells[cellKey(r.user_id, `p:${r.program_id}`)] = "owned";
  for (const r of ca[0] as RowDataPacket[]) cells[cellKey(r.user_id, `c:${r.course_id}`)] = r.status === "active" ? "assigned" : "burned";
  for (const r of pa[0] as RowDataPacket[]) cells[cellKey(r.user_id, `p:${r.program_id}`)] = r.status === "active" ? "assigned" : "burned";
  return { columns, cells };
}

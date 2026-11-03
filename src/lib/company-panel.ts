import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { getSeatSummaries, listCompanyProgress, type ProgressRow, type SeatSummary } from "@/lib/company-seats";

export type CompanyPanelData = {
  company: { id: number; name: string; code: string };
  seats: SeatSummary[];
  progress: ProgressRow[];
  pendingMembers: { id: number; name: string; email: string }[];
  activeMembers: { id: number; userId: number; name: string; email: string; role: "member" | "admin" }[];
  openRequests: { id: number; userName: string; courseId: number; courseTitle: string; freeSeats: number }[];
  /** Kontenjan satın alınabilecek (yayında, ücretli) eğitimler; satırdaki "Daha fazla al" bağlantısı için slug da buradan gelir. */
  courses: { id: number; title: string; slug: string }[];
};

/** Şirket panelinin tüm verisi (şirket admini ve ana admin aynı görünümü kullanır). `null`: şirket yok. */
export async function getCompanyPanelData(companyId: number): Promise<CompanyPanelData | null> {
  const [co] = await pool.query<RowDataPacket[]>("SELECT id, name, code FROM companies WHERE id = ?", [companyId]);
  if (co.length === 0) return null;

  const [seats, progress, members, requests, courses] = await Promise.all([
    getSeatSummaries(companyId),
    listCompanyProgress(companyId),
    pool.query<RowDataPacket[]>(
      `SELECT m.id, m.user_id, m.role, m.status, u.full_name, u.email
         FROM company_members m JOIN users u ON u.id = m.user_id WHERE m.company_id = ? ORDER BY m.status, u.full_name`,
      [companyId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT r.id, r.course_id, c.title, u.full_name
         FROM company_course_requests r JOIN courses c ON c.id = r.course_id JOIN users u ON u.id = r.user_id
        WHERE r.company_id = ? AND r.status = 'pending' ORDER BY r.id`,
      [companyId],
    ),
    pool.query<RowDataPacket[]>("SELECT id, title, slug FROM courses WHERE is_published = 1 AND price > 0 ORDER BY title"),
  ]);

  const free = new Map(seats.map((s) => [s.courseId, s.free]));
  return {
    company: { id: co[0].id, name: co[0].name, code: co[0].code },
    seats,
    progress,
    pendingMembers: members[0].filter((m) => m.status === "pending").map((m) => ({ id: m.id, name: m.full_name, email: m.email })),
    activeMembers: members[0].filter((m) => m.status === "active").map((m) => ({ id: m.id, userId: m.user_id, name: m.full_name, email: m.email, role: m.role })),
    openRequests: requests[0].map((r) => ({ id: r.id, userName: r.full_name, courseId: r.course_id, courseTitle: r.title, freeSeats: free.get(r.course_id) ?? 0 })),
    courses: courses[0].map((c) => ({ id: c.id, title: c.title, slug: c.slug })),
  };
}

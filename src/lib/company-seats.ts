import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import {
  allocationBlock,
  assignBlock,
  canRemoveAdmin,
  isWatched,
  progressStatus,
  reclaimOutcome,
  type AssignBlockReason,
  type ProgressStatus,
} from "@/lib/company-rules";

// Kontenjan: toplam = SUM(company_allocations.quantity), atanan = active, yanan = burned, boş = toplam − atanan − yanan.
// Yazan her işlev şirket satırını `FOR UPDATE` ile kilitler: aynı şirkette eş zamanlı atama/geri alma sırayla işler
// (son boş kontenjan iki kişiye verilemez).

type Queryable = Pick<PoolConnection, "query" | "execute">;

export type SeatSummary = { courseId: number; courseTitle: string; total: number; assigned: number; burned: number; free: number };

async function lockCompany(conn: PoolConnection, companyId: number): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT id FROM companies WHERE id = ? FOR UPDATE", [companyId]);
  return rows.length > 0;
}

async function seatCounts(conn: Queryable, companyId: number, courseId: number): Promise<{ total: number; assigned: number; burned: number; free: number }> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE((SELECT SUM(quantity) FROM company_allocations WHERE company_id = ? AND course_id = ?), 0) AS total,
            (SELECT COUNT(*) FROM company_assignments WHERE company_id = ? AND course_id = ? AND status = 'active') AS assigned,
            (SELECT COUNT(*) FROM company_assignments WHERE company_id = ? AND course_id = ? AND status = 'burned') AS burned`,
    [companyId, courseId, companyId, courseId, companyId, courseId],
  );
  const total = Number(rows[0].total), assigned = Number(rows[0].assigned), burned = Number(rows[0].burned);
  return { total, assigned, burned, free: total - assigned - burned };
}

export async function getSeatSummaries(companyId: number): Promise<SeatSummary[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id AS course_id, c.title,
            COALESCE((SELECT SUM(a.quantity) FROM company_allocations a WHERE a.company_id = ? AND a.course_id = c.id), 0) AS total,
            (SELECT COUNT(*) FROM company_assignments s WHERE s.company_id = ? AND s.course_id = c.id AND s.status = 'active') AS assigned,
            (SELECT COUNT(*) FROM company_assignments s WHERE s.company_id = ? AND s.course_id = c.id AND s.status = 'burned') AS burned
       FROM courses c WHERE c.id IN (SELECT course_id FROM company_allocations WHERE company_id = ?) ORDER BY c.title`,
    [companyId, companyId, companyId, companyId],
  );
  return rows.map((r) => {
    const total = Number(r.total), assigned = Number(r.assigned), burned = Number(r.burned);
    return { courseId: r.course_id, courseTitle: r.title, total, assigned, burned, free: total - assigned - burned };
  });
}

/** Kontenjan girişi ekler (sipariş ya da ana admin tanımı). Ana admin negatif delta ile azaltabilir ama kullanılanın altına inemez. */
export async function addAllocation(i: { companyId: number; courseId: number; delta: number; source: "purchase" | "admin"; orderId?: number; createdBy?: number }): Promise<
  { ok: true } | { ok: false; reason: "zero" | "below_used" | "no_course" }
> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (!(await lockCompany(conn, i.companyId))) {
      await conn.rollback();
      return { ok: false, reason: "no_course" };
    }
    const [course] = await conn.query<RowDataPacket[]>("SELECT 1 FROM courses WHERE id = ?", [i.courseId]);
    if (course.length === 0) {
      await conn.rollback();
      return { ok: false, reason: "no_course" };
    }
    const c = await seatCounts(conn, i.companyId, i.courseId);
    const block = allocationBlock({ currentTotal: c.total, assigned: c.assigned, burned: c.burned, delta: i.delta });
    if (block) {
      await conn.rollback();
      return { ok: false, reason: block };
    }
    await conn.execute("INSERT INTO company_allocations (company_id, course_id, quantity, source, order_id, created_by) VALUES (?, ?, ?, ?, ?, ?)", [
      i.companyId, i.courseId, i.delta, i.source, i.orderId ?? null, i.createdBy ?? null,
    ]);
    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Kontenjandan üyeye eğitim atar ve normal bir kurs kaydı (source='company') açar. */
export async function assignSeat(i: { companyId: number; courseId: number; userId: number; assignedBy: number }): Promise<{ ok: true } | { ok: false; reason: AssignBlockReason }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockCompany(conn, i.companyId);
    const [mem] = await conn.query<RowDataPacket[]>("SELECT status FROM company_members WHERE user_id = ? AND company_id = ?", [i.userId, i.companyId]);
    const [existing] = await conn.query<RowDataPacket[]>("SELECT id, status FROM company_assignments WHERE company_id = ? AND course_id = ? AND user_id = ? FOR UPDATE", [i.companyId, i.courseId, i.userId]);
    const [enr] = await conn.query<RowDataPacket[]>("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1", [i.userId, i.courseId]);
    const counts = await seatCounts(conn, i.companyId, i.courseId);
    const block = assignBlock({
      free: counts.free,
      member: mem[0]?.status === "active" ? "active" : "other",
      burned: existing[0]?.status === "burned",
      alreadyHasAccess: enr.length > 0,
    });
    if (block) {
      await conn.rollback();
      return { ok: false, reason: block };
    }
    // Sertifikası olan (daha önce tamamlamış) kullanıcıya yeniden verilince kayıt 'completed' açılır; ilerleme zaten silinmemiştir.
    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT IGNORE INTO enrollments (user_id, course_id, status, source)
       VALUES (?, ?, IF(EXISTS(SELECT 1 FROM certificates WHERE user_id = ? AND course_id = ?), 'completed', 'active'), 'company')`,
      [i.userId, i.courseId, i.userId, i.courseId],
    );
    if (ins.affectedRows === 0) {
      await conn.rollback();
      return { ok: false, reason: "already_owned" };
    }
    if (existing[0]) {
      await conn.execute("UPDATE company_assignments SET status = 'active', assigned_by = ?, assigned_at = NOW(), ended_at = NULL WHERE id = ?", [i.assignedBy, existing[0].id]);
    } else {
      await conn.execute("INSERT INTO company_assignments (company_id, course_id, user_id, status, assigned_by) VALUES (?, ?, ?, 'active', ?)", [i.companyId, i.courseId, i.userId, i.assignedBy]);
    }
    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Kullanıcı bu kursta video izlemiş mi: tamamlanmış ders ya da eşik üstü video akışı (`isWatched`). */
export async function hasWatched(conn: Queryable, userId: number, courseId: number): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
              WHERE lp.user_id = ? AND m.course_id = ?) AS completed,
            (SELECT COALESCE(SUM(u.bytes), 0) FROM video_stream_usage u JOIN lessons l ON l.id = u.lesson_id JOIN modules m ON m.id = l.module_id
              WHERE u.user_id = ? AND m.course_id = ?) AS bytes`,
    [userId, courseId, userId, courseId],
  );
  return isWatched({ completedLessons: Number(rows[0].completed), streamBytes: Number(rows[0].bytes) });
}

/** Aktif atamayı bitirir: erişimi (yalnızca şirket kaydını) kapatır; ilerleme ve sertifika silinmez. */
async function endAssignment(conn: PoolConnection, a: { id: number; user_id: number; course_id: number }, outcome: "return" | "burn"): Promise<void> {
  await conn.execute("UPDATE company_assignments SET status = ?, ended_at = NOW() WHERE id = ?", [outcome === "burn" ? "burned" : "revoked", a.id]);
  await conn.execute("DELETE FROM enrollments WHERE user_id = ? AND course_id = ? AND source = 'company'", [a.user_id, a.course_id]);
}

export type ReclaimResult = { ok: true; outcome: "return" | "burn" } | { ok: false; reason: "not_found" | "needs_confirm"; courseTitle?: string };

/** Atanmış kontenjanı geri alır. İzlenmiş eğitimde `confirmBurn` yoksa hiçbir şey değişmez ve `needs_confirm` döner. */
export async function reclaimSeat(i: { companyId: number; assignmentId: number; confirmBurn: boolean }): Promise<ReclaimResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockCompany(conn, i.companyId);
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT a.id, a.user_id, a.course_id, c.title FROM company_assignments a JOIN courses c ON c.id = a.course_id
        WHERE a.id = ? AND a.company_id = ? AND a.status = 'active' FOR UPDATE`,
      [i.assignmentId, i.companyId],
    );
    const a = rows[0];
    if (!a) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    const outcome = reclaimOutcome(await hasWatched(conn, a.user_id, a.course_id), i.confirmBurn);
    if (outcome === "needs_confirm") {
      await conn.rollback();
      return { ok: false, reason: "needs_confirm", courseTitle: a.title };
    }
    await endAssignment(conn, a as { id: number; user_id: number; course_id: number }, outcome);
    await conn.commit();
    return { ok: true, outcome };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type RemoveMemberResult = { ok: true } | { ok: false; reason: "not_found" | "last_admin" | "needs_confirm"; courseTitles?: string[] };

/** Üyeyi şirketten çıkarır; atanmış kontenjanları geri alma kuralıyla işler (izlenmiş olan varsa onay ister). */
export async function removeMember(i: { companyId: number; memberId: number; confirmBurn: boolean }): Promise<RemoveMemberResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockCompany(conn, i.companyId);
    const [rows] = await conn.query<RowDataPacket[]>("SELECT id, user_id, role, status FROM company_members WHERE id = ? AND company_id = ? FOR UPDATE", [i.memberId, i.companyId]);
    const m = rows[0];
    if (!m) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    if (m.role === "admin" && m.status === "active") {
      const [admins] = await conn.query<RowDataPacket[]>("SELECT id FROM company_members WHERE company_id = ? AND role = 'admin' AND status = 'active' FOR UPDATE", [i.companyId]);
      if (!canRemoveAdmin(admins.length)) {
        await conn.rollback();
        return { ok: false, reason: "last_admin" };
      }
    }
    const [assignments] = await conn.query<RowDataPacket[]>(
      `SELECT a.id, a.user_id, a.course_id, c.title FROM company_assignments a JOIN courses c ON c.id = a.course_id
        WHERE a.company_id = ? AND a.user_id = ? AND a.status = 'active' FOR UPDATE`,
      [i.companyId, m.user_id],
    );
    const plan = [] as { a: RowDataPacket; outcome: "return" | "burn" }[];
    const needConfirm: string[] = [];
    for (const a of assignments) {
      const outcome = reclaimOutcome(await hasWatched(conn, a.user_id, a.course_id), i.confirmBurn);
      if (outcome === "needs_confirm") needConfirm.push(a.title);
      else plan.push({ a, outcome });
    }
    if (needConfirm.length > 0) {
      await conn.rollback();
      return { ok: false, reason: "needs_confirm", courseTitles: needConfirm };
    }
    for (const p of plan) await endAssignment(conn, p.a as { id: number; user_id: number; course_id: number }, p.outcome);
    await conn.execute("DELETE FROM company_members WHERE id = ?", [i.memberId]);
    await conn.commit();
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type ProgressRow = {
  assignmentId: number;
  userId: number;
  userName: string;
  userEmail: string;
  courseId: number;
  courseTitle: string;
  completedLessons: number;
  totalLessons: number;
  status: ProgressStatus;
  certificateCode: string | null;
};

/** Şirketin atadığı (aktif) eğitimlerde çalışan durumu. Üyenin şirket dışı kayıtları ve bitmiş atamalar dahil değildir. */
export async function listCompanyProgress(companyId: number): Promise<ProgressRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.id AS assignment_id, a.user_id, u.full_name, u.email, a.course_id, c.title, cert.certificate_code,
            (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
              WHERE lp.user_id = a.user_id AND m.course_id = a.course_id) AS completed,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = a.course_id) AS total
       FROM company_assignments a
       JOIN users u ON u.id = a.user_id
       JOIN courses c ON c.id = a.course_id
       LEFT JOIN certificates cert ON cert.user_id = a.user_id AND cert.course_id = a.course_id
      WHERE a.company_id = ? AND a.status = 'active'
      ORDER BY u.full_name, c.title`,
    [companyId],
  );
  return rows.map((r) => {
    const completed = Number(r.completed), total = Number(r.total), certificate: string | null = r.certificate_code ?? null;
    return {
      assignmentId: r.assignment_id,
      userId: r.user_id,
      userName: r.full_name,
      userEmail: r.email,
      courseId: r.course_id,
      courseTitle: r.title,
      completedLessons: completed,
      totalLessons: total,
      status: progressStatus({ completed, total, certificate }),
      certificateCode: certificate,
    };
  });
}

// ── Eğitim talepleri ──────────────────────────────────────────────────────────
export type CreateRequestResult = { ok: true } | { ok: false; reason: "not_member" | "already_owned" | "duplicate" | "no_course" };

/** Onaylı üyenin şirket adminine "bu kursu alın" talebi. Şirket, üyelikten türetilir (istemciden alınmaz). */
export async function createCourseRequest(userId: number, courseId: number): Promise<CreateRequestResult> {
  const [mem] = await pool.query<RowDataPacket[]>("SELECT company_id FROM company_members WHERE user_id = ? AND status = 'active' LIMIT 1", [userId]);
  if (mem.length === 0) return { ok: false, reason: "not_member" };
  const [course] = await pool.query<RowDataPacket[]>("SELECT 1 FROM courses WHERE id = ? AND is_published = 1", [courseId]);
  if (course.length === 0) return { ok: false, reason: "no_course" };
  const [enr] = await pool.query<RowDataPacket[]>("SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1", [userId, courseId]);
  if (enr.length > 0) return { ok: false, reason: "already_owned" };
  try {
    await pool.execute("INSERT INTO company_course_requests (company_id, course_id, user_id) VALUES (?, ?, ?)", [mem[0].company_id, courseId, userId]);
    return { ok: true };
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") return { ok: false, reason: "duplicate" };
    throw err;
  }
}

export type ResolveRequestResult = { ok: true } | { ok: false; reason: "not_found" | "bad_state" | AssignBlockReason };

/** Talebi çözer: `assign` kontenjandan atar ve talebi karşılar; `reject` reddeder. Talep her zaman `company_id` ile aranır. */
export async function resolveCourseRequest(i: { companyId: number; requestId: number; action: "assign" | "reject"; actorId: number }): Promise<ResolveRequestResult> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT id, user_id, course_id, status FROM company_course_requests WHERE id = ? AND company_id = ?", [i.requestId, i.companyId]);
  const req = rows[0];
  if (!req) return { ok: false, reason: "not_found" };
  if (req.status !== "pending") return { ok: false, reason: "bad_state" };
  if (i.action === "assign") {
    const r = await assignSeat({ companyId: i.companyId, courseId: req.course_id, userId: req.user_id, assignedBy: i.actorId });
    if (!r.ok) return r;
  }
  const [res] = await pool.execute<ResultSetHeader>(
    "UPDATE company_course_requests SET status = ?, resolved_at = NOW(), resolved_by = ? WHERE id = ? AND status = 'pending'",
    [i.action === "assign" ? "fulfilled" : "rejected", i.actorId, i.requestId],
  );
  return res.affectedRows > 0 ? { ok: true } : { ok: false, reason: "bad_state" };
}

export type MyRequest = { id: number; courseTitle: string; status: "pending" | "fulfilled" | "rejected"; createdAt: string };

export async function listMyRequests(userId: number): Promise<MyRequest[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.id, c.title, r.status, r.created_at FROM company_course_requests r JOIN courses c ON c.id = r.course_id WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 50`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, courseTitle: r.title, status: r.status, createdAt: r.created_at }));
}

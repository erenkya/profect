import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { lockCompany } from "@/lib/company-lock";
import { hasWatchedProgram, listActiveProgramAssignments, releaseProgramAccess } from "@/lib/company-program-seats";
import { hasWatched } from "@/lib/company-watch";
import { effectiveDue } from "@/lib/due-rules";
import {
  allocationBlock,
  assignBlock,
  canRemoveAdmin,
  courseProgress,
  progressStatus,
  reclaimOutcome,
  type AssignBlockReason,
  type ProgressStatus,
} from "@/lib/company-rules";

// Kontenjan: toplam = SUM(company_allocations.quantity), atanan = active, yanan = burned, boş = toplam − atanan − yanan.
// Yazan her işlev şirket satırını `FOR UPDATE` ile kilitler: aynı şirkette eş zamanlı atama/geri alma sırayla işler
// (son boş kontenjan iki kişiye verilemez).

type Queryable = Pick<PoolConnection, "query" | "execute">;

export type SeatSummary = { courseId: number; courseTitle: string; total: number; assigned: number; burned: number; free: number; deadline: string | null };

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
            (SELECT COUNT(*) FROM company_assignments s WHERE s.company_id = ? AND s.course_id = c.id AND s.status = 'burned') AS burned,
            (SELECT d.due_at FROM company_course_deadlines d WHERE d.company_id = ? AND d.course_id = c.id) AS deadline
       FROM courses c WHERE c.id IN (SELECT course_id FROM company_allocations WHERE company_id = ?) ORDER BY c.title`,
    [companyId, companyId, companyId, companyId, companyId],
  );
  return rows.map((r) => {
    const total = Number(r.total), assigned = Number(r.assigned), burned = Number(r.burned);
    return { courseId: r.course_id, courseTitle: r.title, total, assigned, burned, free: total - assigned - burned, deadline: r.deadline ?? null };
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
export async function assignSeat(i: { companyId: number; courseId: number; userId: number; assignedBy: number; dueAt?: string | null }): Promise<{ ok: true } | { ok: false; reason: AssignBlockReason }> {
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
      await conn.execute("UPDATE company_assignments SET status = 'active', assigned_by = ?, assigned_at = NOW(), ended_at = NULL, due_at = ? WHERE id = ?", [i.assignedBy, i.dueAt ?? null, existing[0].id]);
    } else {
      await conn.execute("INSERT INTO company_assignments (company_id, course_id, user_id, status, assigned_by, due_at) VALUES (?, ?, ?, 'active', ?, ?)", [i.companyId, i.courseId, i.userId, i.assignedBy, i.dueAt ?? null]);
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

/** Aktif atamayı bitirir: erişimi (yalnızca şirket kaydını) kapatır; ilerleme ve sertifika silinmez. */
async function endAssignment(conn: PoolConnection, a: { id: number; user_id: number; course_id: number }, outcome: "return" | "burn"): Promise<void> {
  await conn.execute("UPDATE company_assignments SET status = ?, ended_at = NOW() WHERE id = ?", [outcome === "burn" ? "burned" : "revoked", a.id]);
  // Kurs, çalışanın aktif bir program ataması tarafından da karşılanıyorsa kayıt kalır (program geri alınınca o kuralla işlenir).
  const [covered] = await conn.query<RowDataPacket[]>(
    `SELECT 1 FROM company_program_assignments pa JOIN program_courses pc ON pc.program_id = pa.program_id
      WHERE pa.user_id = ? AND pa.status = 'active' AND pc.course_id = ? LIMIT 1`,
    [a.user_id, a.course_id],
  );
  if (covered.length === 0) await conn.execute("DELETE FROM enrollments WHERE user_id = ? AND course_id = ? AND source = 'company'", [a.user_id, a.course_id]);
}

export type ReclaimResult = { ok: true; outcome: "return" | "burn" } | { ok: false; reason: "not_found" | "needs_confirm"; courseTitle?: string; userName?: string };

/** Atanmış kontenjanı geri alır. İzlenmiş eğitimde `confirmBurn` yoksa hiçbir şey değişmez ve `needs_confirm` döner. */
export async function reclaimSeat(i: { companyId: number; assignmentId: number; confirmBurn: boolean }): Promise<ReclaimResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockCompany(conn, i.companyId);
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT a.id, a.user_id, a.course_id, c.title, u.full_name AS user_name FROM company_assignments a JOIN courses c ON c.id = a.course_id JOIN users u ON u.id = a.user_id
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
      return { ok: false, reason: "needs_confirm", courseTitle: a.title, userName: a.user_name };
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

export type RemoveMemberResult = { ok: true } | { ok: false; reason: "not_found" | "last_admin" | "needs_confirm"; courseTitles?: string[]; userName?: string };

/** Üyeyi şirketten çıkarır; atanmış kontenjanları geri alma kuralıyla işler (izlenmiş olan varsa onay ister). */
export async function removeMember(i: { companyId: number; memberId: number; confirmBurn: boolean }): Promise<RemoveMemberResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockCompany(conn, i.companyId);
    const [rows] = await conn.query<RowDataPacket[]>("SELECT m.id, m.user_id, m.role, m.status, u.full_name AS user_name FROM company_members m JOIN users u ON u.id = m.user_id WHERE m.id = ? AND m.company_id = ? FOR UPDATE", [i.memberId, i.companyId]);
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
    const programPlan = [] as { a: Awaited<ReturnType<typeof listActiveProgramAssignments>>[number]; outcome: "return" | "burn" }[];
    for (const a of await listActiveProgramAssignments(conn, i.companyId, m.user_id)) {
      const outcome = reclaimOutcome(await hasWatchedProgram(conn, a.user_id, a.program_id), i.confirmBurn);
      if (outcome === "needs_confirm") needConfirm.push(a.title);
      else programPlan.push({ a, outcome });
    }
    if (needConfirm.length > 0) {
      await conn.rollback();
      return { ok: false, reason: "needs_confirm", courseTitles: needConfirm, userName: m.user_name };
    }
    for (const p of plan) await endAssignment(conn, p.a as { id: number; user_id: number; course_id: number }, p.outcome);
    for (const p of programPlan) await releaseProgramAccess(conn, p.a, p.outcome);
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

/** Çalışanın bir sınavdaki durumu. `moduleTitle` null ise kurs final sınavıdır. */
export type QuizResult = {
  quizId: number;
  title: string;
  moduleTitle: string | null;
  passingScore: number;
  attempts: number;
  /** En yüksek puan (yüzde) ya da hiç girmediyse null. */
  bestScore: number | null;
  /** Son denemenin puanı ya da null. */
  lastScore: number | null;
  /** Herhangi bir denemede geçtiyse true. */
  passed: boolean;
  /** Son denemenin zamanı (UTC) ya da null. */
  lastAttemptAt: string | null;
};

export type ProgressRow = {
  assignmentId: number;
  userId: number;
  userName: string;
  userEmail: string;
  courseId: number;
  courseTitle: string;
  completedLessons: number;
  totalLessons: number;
  /** Öğrencinin gördüğü ilerleme yüzdesi: dersler ve final sınavı birlikte. */
  percentage: number;
  status: ProgressStatus;
  certificateCode: string | null;
  /** Çalışana özel son tarih (UTC) ya da null. */
  dueAt: string | null;
  /** Eğitim geneli son tarih (UTC) ya da null. */
  courseDueAt: string | null;
  /** Geçerli olan: ikisinden erken olan. */
  effectiveDueAt: string | null;
  /** Eğitimin çalışana atandığı an (UTC). */
  assignedAt: string;
  /** Çalışanın bu eğitimde son tamamladığı dersin zamanı (UTC) ya da null. */
  lastActivityAt: string | null;
  /** Eğitimin (soru içeren) sınavları: önce modül sınavları, sonda final. Girilmemiş sınav da listelenir. */
  quizzes: QuizResult[];
};

/** Şirketin atadığı (aktif) eğitimlerde çalışan durumu. Üyenin şirket dışı kayıtları ve bitmiş atamalar dahil değildir. */
export async function listCompanyProgress(companyId: number): Promise<ProgressRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.id AS assignment_id, a.user_id, u.full_name, u.email, a.course_id, c.title, cert.certificate_code, a.due_at, a.assigned_at, d.due_at AS course_due_at,
            (SELECT MAX(lp.completed_at) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
              WHERE lp.user_id = a.user_id AND m.course_id = a.course_id) AS last_activity,
            (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
              WHERE lp.user_id = a.user_id AND m.course_id = a.course_id) AS completed,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = a.course_id) AS total
       FROM company_assignments a
       JOIN users u ON u.id = a.user_id
       JOIN courses c ON c.id = a.course_id
       LEFT JOIN certificates cert ON cert.user_id = a.user_id AND cert.course_id = a.course_id
       LEFT JOIN company_course_deadlines d ON d.company_id = a.company_id AND d.course_id = a.course_id
      WHERE a.company_id = ? AND a.status = 'active'
      ORDER BY u.full_name, c.title`,
    [companyId],
  );
  const quizzes = await listAssignmentQuizResults(companyId);
  return rows.map((r) => {
    const completed = Number(r.completed), total = Number(r.total), certificate: string | null = r.certificate_code ?? null;
    const rowQuizzes = quizzes.get(r.assignment_id) ?? [];
    const finals = rowQuizzes.filter((q) => q.moduleTitle === null);
    const counts = { completed, total, quizzesPassed: finals.filter((q) => q.passed).length, quizzesTotal: finals.length };
    return {
      assignmentId: r.assignment_id,
      userId: r.user_id,
      userName: r.full_name,
      userEmail: r.email,
      courseId: r.course_id,
      courseTitle: r.title,
      completedLessons: completed,
      totalLessons: total,
      percentage: courseProgress(counts).percentage,
      status: progressStatus({ ...counts, certificate }),
      certificateCode: certificate,
      dueAt: r.due_at ?? null,
      courseDueAt: r.course_due_at ?? null,
      effectiveDueAt: effectiveDue(r.due_at ?? null, r.course_due_at ?? null),
      assignedAt: r.assigned_at,
      lastActivityAt: r.last_activity ?? null,
      quizzes: rowQuizzes,
    };
  });
}

/** Şirketin aktif atamalarındaki sınav sonuçları, atama kimliğine göre. Yalnızca soru içeren (senaryo dışı) sınavlar sayılır. */
async function listAssignmentQuizResults(companyId: number): Promise<Map<number, QuizResult[]>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.id AS assignment_id, q.id AS quiz_id, q.title, q.module_id, mo.title AS module_title, q.passing_score_percentage,
            COUNT(qa.id) AS attempts, MAX(qa.score) AS best, MAX(qa.is_passed) AS passed, MAX(qa.attempted_at) AS last_at,
            (SELECT x.score FROM quiz_attempts x WHERE x.user_id = a.user_id AND x.quiz_id = q.id ORDER BY x.attempted_at DESC, x.id DESC LIMIT 1) AS last_score
       FROM company_assignments a
       JOIN quizzes q ON q.course_id = a.course_id
       LEFT JOIN modules mo ON mo.id = q.module_id
       LEFT JOIN quiz_attempts qa ON qa.user_id = a.user_id AND qa.quiz_id = q.id
      WHERE a.company_id = ? AND a.status = 'active'
        AND EXISTS (SELECT 1 FROM questions qu WHERE qu.quiz_id = q.id AND qu.type <> 'scenario')
      GROUP BY a.id, q.id, mo.id
      ORDER BY a.id, (q.module_id IS NULL), mo.sort_order, q.id`,
    [companyId],
  );
  const byAssignment = new Map<number, QuizResult[]>();
  for (const r of rows) {
    const list = byAssignment.get(r.assignment_id) ?? [];
    list.push({
      quizId: r.quiz_id,
      title: r.title,
      moduleTitle: r.module_id ? r.module_title : null,
      passingScore: Number(r.passing_score_percentage),
      attempts: Number(r.attempts),
      bestScore: r.best === null ? null : Number(r.best),
      lastScore: r.last_score === null ? null : Number(r.last_score),
      passed: Number(r.passed) === 1,
      lastAttemptAt: r.last_at ?? null,
    });
    byAssignment.set(r.assignment_id, list);
  }
  return byAssignment;
}

/** Atamanın çalışana özel son tarihini değiştirir ya da (`null`) kaldırır. Atama her zaman `company_id` ile aranır. */
export async function setAssignmentDue(i: { companyId: number; assignmentId: number; dueAt: string | null }): Promise<boolean> {
  const [res] = await pool.execute<ResultSetHeader>(
    "UPDATE company_assignments SET due_at = ? WHERE id = ? AND company_id = ? AND status = 'active'",
    [i.dueAt, i.assignmentId, i.companyId],
  );
  return res.affectedRows > 0;
}

/** Şirketin bir eğitimi için tüm çalışanlara uygulanan son tarihi koyar, değiştirir ya da (`null`) kaldırır. Şirketin kontenjanı olmayan eğitime konamaz. */
export async function setCourseDeadline(i: { companyId: number; courseId: number; dueAt: string | null; actorId: number }): Promise<boolean> {
  const [alloc] = await pool.query<RowDataPacket[]>("SELECT 1 FROM company_allocations WHERE company_id = ? AND course_id = ? LIMIT 1", [i.companyId, i.courseId]);
  if (alloc.length === 0) return false;
  if (i.dueAt === null) {
    await pool.execute("DELETE FROM company_course_deadlines WHERE company_id = ? AND course_id = ?", [i.companyId, i.courseId]);
    return true;
  }
  await pool.execute(
    `INSERT INTO company_course_deadlines (company_id, course_id, due_at, set_by) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE due_at = VALUES(due_at), set_by = VALUES(set_by)`,
    [i.companyId, i.courseId, i.dueAt, i.actorId],
  );
  return true;
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

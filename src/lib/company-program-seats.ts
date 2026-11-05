import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { lockCompany } from "@/lib/company-lock";
import { allocationBlock, reclaimOutcome } from "@/lib/company-rules";
import { programAssignBlock, releasableCourseIds, type ProgramAssignBlockReason } from "@/lib/program-seat-rules";
import { hasWatched } from "@/lib/company-watch";
import { enrollInProgram, ensureProgramProgress, type Queryable } from "@/lib/programs";

// Program kontenjanı: kurs kontenjanının paralel havuzu. Toplam = SUM(company_program_allocations.quantity), atanan = active,
// yanan = burned, boş = toplam − atanan − yanan. Yazan her işlev şirket satırını `FOR UPDATE` ile kilitler (company-seats.ts ile aynı kalıp).

export type ProgramSeatSummary = { programId: number; programTitle: string; slug: string; total: number; assigned: number; burned: number; free: number };

async function programSeatCounts(conn: Queryable, companyId: number, programId: number): Promise<{ total: number; assigned: number; burned: number; free: number }> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COALESCE((SELECT SUM(quantity) FROM company_program_allocations WHERE company_id = ? AND program_id = ?), 0) AS total,
            (SELECT COUNT(*) FROM company_program_assignments WHERE company_id = ? AND program_id = ? AND status = 'active') AS assigned,
            (SELECT COUNT(*) FROM company_program_assignments WHERE company_id = ? AND program_id = ? AND status = 'burned') AS burned`,
    [companyId, programId, companyId, programId, companyId, programId],
  );
  const total = Number(rows[0].total), assigned = Number(rows[0].assigned), burned = Number(rows[0].burned);
  return { total, assigned, burned, free: total - assigned - burned };
}

/** Kontenjanı olan programlar (ada göre). */
export async function getProgramSeatSummaries(companyId: number): Promise<ProgramSeatSummary[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.id AS program_id, p.title, p.slug,
            COALESCE((SELECT SUM(a.quantity) FROM company_program_allocations a WHERE a.company_id = ? AND a.program_id = p.id), 0) AS total,
            (SELECT COUNT(*) FROM company_program_assignments s WHERE s.company_id = ? AND s.program_id = p.id AND s.status = 'active') AS assigned,
            (SELECT COUNT(*) FROM company_program_assignments s WHERE s.company_id = ? AND s.program_id = p.id AND s.status = 'burned') AS burned
       FROM programs p WHERE p.id IN (SELECT program_id FROM company_program_allocations WHERE company_id = ?) ORDER BY p.title`,
    [companyId, companyId, companyId, companyId],
  );
  return rows.map((r) => {
    const total = Number(r.total), assigned = Number(r.assigned), burned = Number(r.burned);
    return { programId: r.program_id, programTitle: r.title, slug: r.slug, total, assigned, burned, free: total - assigned - burned };
  });
}

/** Program kontenjanı girişi ekler (sipariş ya da ana admin tanımı). Azaltma kullanılanın (atanan + yanan) altına inemez. */
export async function addProgramAllocation(i: { companyId: number; programId: number; delta: number; source: "purchase" | "admin"; orderId?: number; createdBy?: number }): Promise<
  { ok: true } | { ok: false; reason: "zero" | "below_used" | "no_program" }
> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (!(await lockCompany(conn, i.companyId))) {
      await conn.rollback();
      return { ok: false, reason: "no_program" };
    }
    const [program] = await conn.query<RowDataPacket[]>("SELECT 1 FROM programs WHERE id = ?", [i.programId]);
    if (program.length === 0) {
      await conn.rollback();
      return { ok: false, reason: "no_program" };
    }
    const c = await programSeatCounts(conn, i.companyId, i.programId);
    const block = allocationBlock({ currentTotal: c.total, assigned: c.assigned, burned: c.burned, delta: i.delta });
    if (block) {
      await conn.rollback();
      return { ok: false, reason: block };
    }
    await conn.execute("INSERT INTO company_program_allocations (company_id, program_id, quantity, source, order_id, created_by) VALUES (?, ?, ?, ?, ?, ?)", [
      i.companyId, i.programId, i.delta, i.source, i.orderId ?? null, i.createdBy ?? null,
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

/**
 * Program kontenjanından üyeye program atar: üyeyi programa (`program_enrollments`, kaynak `company`) ve programdaki her kursa
 * (`enrollments`, kaynak `company`; başka kaynaklı kayda dokunulmaz) yazar. Programdaki bazı kurslara zaten sahip olan çalışana da verilebilir.
 */
export async function assignProgramSeat(i: { companyId: number; programId: number; userId: number; assignedBy: number }): Promise<{ ok: true } | { ok: false; reason: ProgramAssignBlockReason }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockCompany(conn, i.companyId);
    const [mem] = await conn.query<RowDataPacket[]>("SELECT status FROM company_members WHERE user_id = ? AND company_id = ?", [i.userId, i.companyId]);
    const [existing] = await conn.query<RowDataPacket[]>(
      "SELECT id, status FROM company_program_assignments WHERE company_id = ? AND program_id = ? AND user_id = ? FOR UPDATE",
      [i.companyId, i.programId, i.userId],
    );
    const [enrolled] = await conn.query<RowDataPacket[]>("SELECT 1 FROM program_enrollments WHERE user_id = ? AND program_id = ? LIMIT 1", [i.userId, i.programId]);
    const [courses] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM program_courses WHERE program_id = ?", [i.programId]);
    const counts = await programSeatCounts(conn, i.companyId, i.programId);
    const block = programAssignBlock({
      free: counts.free,
      member: mem[0]?.status === "active" ? "active" : "other",
      burned: existing[0]?.status === "burned",
      alreadyProgramMember: enrolled.length > 0,
      courseCount: Number(courses[0].n),
    });
    if (block) {
      await conn.rollback();
      return { ok: false, reason: block };
    }
    await enrollInProgram(conn, i.userId, i.programId, "company");
    if (existing[0]) {
      await conn.execute<ResultSetHeader>("UPDATE company_program_assignments SET status = 'active', assigned_by = ?, assigned_at = NOW(), ended_at = NULL WHERE id = ?", [i.assignedBy, existing[0].id]);
    } else {
      await conn.execute<ResultSetHeader>("INSERT INTO company_program_assignments (company_id, program_id, user_id, status, assigned_by) VALUES (?, ?, ?, 'active', ?)", [i.companyId, i.programId, i.userId, i.assignedBy]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  // Çalışan programın kurs sertifikalarını daha önce almış olabilir: commit sonrası program sertifika kontrolü (hatası atamayı bozmaz).
  await ensureProgramProgress(i.userId, { programId: i.programId }).catch(console.error);
  return { ok: true };
}

/** Çalışan programdaki HERHANGİ bir kursta video izlemiş mi (`hasWatched` kursa göre). */
export async function hasWatchedProgram(conn: Queryable, userId: number, programId: number): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT course_id FROM program_courses WHERE program_id = ?", [programId]);
  for (const r of rows) if (await hasWatched(conn, userId, Number(r.course_id))) return true;
  return false;
}

export type ProgramAssignmentRow = { id: number; user_id: number; program_id: number; title: string };

/** Şirketteki bir kullanıcının aktif program atamaları (kilitli okunur); üye çıkarma bunları da işler. */
export async function listActiveProgramAssignments(conn: PoolConnection, companyId: number, userId: number): Promise<ProgramAssignmentRow[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT a.id, a.user_id, a.program_id, p.title FROM company_program_assignments a JOIN programs p ON p.id = a.program_id
      WHERE a.company_id = ? AND a.user_id = ? AND a.status = 'active' FOR UPDATE`,
    [companyId, userId],
  );
  return rows as ProgramAssignmentRow[];
}

/**
 * Aktif program atamasını bitirir: atama `revoked`/`burned`; `company` kaynaklı program üyeliği ve kurs kayıtları silinir, ama bir kurs kaydı
 * çalışanda hâlâ aktif başka bir şirket ataması (kurs ya da başka program) tarafından karşılanıyorsa kalır. Başka kaynaklı kayıtlara,
 * ilerlemeye ve sertifikalara dokunulmaz.
 */
export async function releaseProgramAccess(conn: PoolConnection, a: { id: number; user_id: number; program_id: number }, outcome: "return" | "burn"): Promise<void> {
  await conn.execute("UPDATE company_program_assignments SET status = ?, ended_at = NOW() WHERE id = ?", [outcome === "burn" ? "burned" : "revoked", a.id]);
  await conn.execute("DELETE FROM program_enrollments WHERE user_id = ? AND program_id = ? AND source = 'company'", [a.user_id, a.program_id]);
  const [pc] = await conn.query<RowDataPacket[]>("SELECT course_id FROM program_courses WHERE program_id = ?", [a.program_id]);
  const programCourseIds = pc.map((r) => Number(r.course_id));
  if (programCourseIds.length === 0) return;
  const [sourced] = await conn.query<RowDataPacket[]>("SELECT course_id FROM enrollments WHERE user_id = ? AND source = 'company' AND course_id IN (?)", [a.user_id, programCourseIds]);
  // Bu atama yukarıda bitirildi; kalan aktif atamalar (kurs ya da başka program) kursu hâlâ karşılıyor olabilir.
  const [covered] = await conn.query<RowDataPacket[]>(
    `SELECT course_id FROM company_assignments WHERE user_id = ? AND status = 'active' AND course_id IN (?)
      UNION
     SELECT pc.course_id FROM company_program_assignments pa JOIN program_courses pc ON pc.program_id = pa.program_id
      WHERE pa.user_id = ? AND pa.status = 'active' AND pc.course_id IN (?)`,
    [a.user_id, programCourseIds, a.user_id, programCourseIds],
  );
  const release = releasableCourseIds({
    programCourseIds,
    companySourced: new Set(sourced.map((r) => Number(r.course_id))),
    coveredElsewhere: new Set(covered.map((r) => Number(r.course_id))),
  });
  // `query` (execute değil): IN (?) için dizi ancak burada açılır.
  if (release.length > 0) await conn.query("DELETE FROM enrollments WHERE user_id = ? AND source = 'company' AND course_id IN (?)", [a.user_id, release]);
}

export type ProgramReclaimResult = { ok: true; outcome: "return" | "burn" } | { ok: false; reason: "not_found" } | { ok: false; reason: "needs_confirm"; programTitle: string; userName: string };

/** Atanmış program kontenjanını geri alır. Programdaki kurslardan birine başlanmışsa `confirmBurn` yoksa hiçbir şey değişmez ve `needs_confirm` döner. */
export async function reclaimProgramSeat(i: { companyId: number; assignmentId: number; confirmBurn: boolean }): Promise<ProgramReclaimResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await lockCompany(conn, i.companyId);
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT a.id, a.user_id, a.program_id, p.title, u.full_name AS user_name FROM company_program_assignments a
         JOIN programs p ON p.id = a.program_id JOIN users u ON u.id = a.user_id
        WHERE a.id = ? AND a.company_id = ? AND a.status = 'active' FOR UPDATE`,
      [i.assignmentId, i.companyId],
    );
    const a = rows[0];
    if (!a) {
      await conn.rollback();
      return { ok: false, reason: "not_found" };
    }
    const outcome = reclaimOutcome(await hasWatchedProgram(conn, a.user_id, a.program_id), i.confirmBurn);
    if (outcome === "needs_confirm") {
      await conn.rollback();
      return { ok: false, reason: "needs_confirm", programTitle: a.title, userName: a.user_name };
    }
    await releaseProgramAccess(conn, a as { id: number; user_id: number; program_id: number }, outcome);
    await conn.commit();
    return { ok: true, outcome };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

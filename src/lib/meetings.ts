import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { createToken, hashToken } from "@/lib/tokens";
import type { ExpertId } from "@/data/experts";
import { canTransition, SLOT_HOLDING, type MeetingAction, type MeetingActor, type MeetingStatus } from "@/lib/meeting-rules";
import { computeSlots, isValidSlot, MAX_DAYS_AHEAD, type Booked, type Rule } from "@/lib/meeting-slots";
import type { MeetingRequestInput, RuleInput } from "@/lib/meeting-schemas";

export const TOKEN_TTL_DAYS = 30;
export const DAILY_REQUESTS_PER_EMAIL = 3;

export type MeetingRow = {
  id: number; expert: ExpertId; durationMin: 15 | 30; startsAt: string; endsAt: string;
  fullName: string; email: string; company: string; jobTitle: string; userId: number | null;
  status: MeetingStatus; proposedStartsAt: string | null; meetingUrl: string | null; decisionNote: string | null;
  icsSequence: number; createdAt: string;
};

const IST = 3 * 3600_000;
const istMs = (s: string) => Date.parse(`${s.slice(0, 10)}T${s.slice(11, 19)}+03:00`);
/** epoch ms → "YYYY-MM-DD HH:mm:ss" (İstanbul yerel). */
export const fmtIst = (ms: number) => new Date(ms + IST).toISOString().slice(0, 19).replace("T", " ");
export const endOf = (startsAt: string, durationMin: number) => fmtIst(istMs(startsAt) + durationMin * 60_000);
const toUtcStr = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

function toRow(r: RowDataPacket): MeetingRow {
  return {
    id: r.id, expert: r.expert, durationMin: r.duration_min, startsAt: r.starts_at, endsAt: r.ends_at,
    fullName: r.full_name, email: r.email, company: r.company, jobTitle: r.job_title, userId: r.user_id,
    status: r.status, proposedStartsAt: r.proposed_starts_at, meetingUrl: r.meeting_url, decisionNote: r.decision_note,
    icsSequence: r.ics_sequence, createdAt: r.created_at,
  };
}
const toRule = (r: RowDataPacket): Rule & { id: number; expert: ExpertId; note: string | null } => ({
  id: r.id, expert: r.expert, kind: r.kind, recurrence: r.recurrence, date: r.date, startsOn: r.starts_on, until: r.until,
  weekdays: r.weekdays, startTime: String(r.start_time).slice(0, 5), endTime: String(r.end_time).slice(0, 5), note: r.note,
});

type Q = Pick<PoolConnection, "query">;

async function loadContext(q: Q, expert: ExpertId, lock = false): Promise<{ rules: Rule[]; booked: Booked[] }> {
  const [rules] = await q.query<RowDataPacket[]>("SELECT * FROM expert_availability_rules WHERE expert = ?", [expert]);
  const [booked] = await q.query<RowDataPacket[]>(
    `SELECT starts_at, ends_at FROM meeting_requests WHERE expert = ? AND status IN (${SLOT_HOLDING.map(() => "?").join(",")}) AND ends_at > ?${lock ? " FOR UPDATE" : ""}`,
    [expert, ...SLOT_HOLDING, fmtIst(Date.now() - 86_400_000)],
  );
  return { rules: rules.map(toRule), booked: booked.map((b) => ({ startsAt: b.starts_at, endsAt: b.ends_at })) };
}

export async function listSlotsForDay(expert: ExpertId, durationMin: 15 | 30, day: string, now = new Date()): Promise<string[]> {
  const ctx = await loadContext(pool, expert);
  return computeSlots({ ...ctx, durationMin, now, day });
}

/** Önümüzdeki 60 günde en az bir boş slotu olan günler ("YYYY-MM-DD"). */
export async function listAvailableDays(expert: ExpertId, durationMin: 15 | 30, now = new Date()): Promise<string[]> {
  const ctx = await loadContext(pool, expert);
  const days: string[] = [];
  for (let i = 0; i <= MAX_DAYS_AHEAD + 1; i++) {
    const day = fmtIst(now.getTime() + i * 86_400_000).slice(0, 10);
    if (computeSlots({ ...ctx, durationMin, now, day }).length) days.push(day);
  }
  return days;
}

export async function createMeetingRequest(
  input: Omit<MeetingRequestInput, "turnstileToken"> & { userId: number | null },
  now = new Date(),
): Promise<{ id: number; expertToken: string; visitorToken: string } | { error: "slot_unavailable" | "rate_limited" }> {
  const [recent] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM meeting_requests WHERE email = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)", [input.email]);
  if (Number(recent[0].n) >= DAILY_REQUESTS_PER_EMAIL) return { error: "rate_limited" };
  const ctx = await loadContext(pool, input.expert);
  if (!isValidSlot({ ...ctx, durationMin: input.durationMin, now, startsAt: input.startsAt })) return { error: "slot_unavailable" };
  const expertT = createToken();
  const visitorT = createToken();
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO meeting_requests (expert, duration_min, starts_at, ends_at, full_name, email, company, job_title, user_id, expert_token_hash, visitor_token_hash, token_expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [input.expert, input.durationMin, input.startsAt, endOf(input.startsAt, input.durationMin), input.fullName, input.email, input.company, input.jobTitle, input.userId,
      expertT.hash, visitorT.hash, toUtcStr(now.getTime() + TOKEN_TTL_DAYS * 86_400_000)],
  );
  await pool.query("INSERT INTO meeting_request_events (meeting_id, actor, action, to_status) VALUES (?, 'visitor', 'create', 'pending')", [res.insertId]);
  return { id: res.insertId, expertToken: expertT.raw, visitorToken: visitorT.raw };
}

export async function getMeeting(id: number): Promise<MeetingRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM meeting_requests WHERE id = ?", [id]);
  return rows[0] ? toRow(rows[0]) : null;
}

/** Ham token → görüşme + rol. Süresi dolmuşsa ya da bulunamazsa null. */
export async function getMeetingByToken(raw: string, now = new Date()): Promise<{ meeting: MeetingRow; role: "expert" | "visitor" } | null> {
  if (!/^[0-9a-f]{64}$/.test(raw)) return null;
  const h = hashToken(raw);
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM meeting_requests WHERE expert_token_hash = ? OR visitor_token_hash = ?", [h, h]);
  const r = rows[0];
  if (!r || Date.parse(`${r.token_expires_at.replace(" ", "T")}Z`) < now.getTime()) return null;
  return { meeting: toRow(r), role: r.expert_token_hash === h ? "expert" : "visitor" };
}

export type ActionResult =
  | { ok: true; meeting: MeetingRow; from: MeetingStatus }
  | { ok: false; reason: "not_found" | "invalid_transition" | "slot_conflict" | "slot_invalid" | "link_required" | "time_required" };

async function hasConflict(conn: Q, expert: ExpertId, startsAt: string, endsAt: string, exceptId: number): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM meeting_requests WHERE expert = ? AND id <> ? AND status IN ('accepted','confirmed') AND starts_at < ? AND ends_at > ? FOR UPDATE`,
    [expert, exceptId, endsAt, startsAt]);
  return rows.length > 0;
}

export async function applyMeetingAction(a: {
  id: number; action: MeetingAction; actor: MeetingActor; actorId?: number; startsAt?: string; meetingUrl?: string; note?: string; now?: Date;
}): Promise<ActionResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM meeting_requests WHERE id = ? FOR UPDATE", [a.id]);
    if (!rows[0]) { await conn.rollback(); return { ok: false, reason: "not_found" }; }
    const m = toRow(rows[0]);
    const to = canTransition(m.status, a.action, a.actor);
    if (!to) { await conn.rollback(); return { ok: false, reason: "invalid_transition" }; }

    const set: Record<string, unknown> = { status: to };
    if (a.note) set.decision_note = a.note;
    if (a.action === "accept") {
      if (await hasConflict(conn, m.expert, m.startsAt, m.endsAt, m.id)) { await conn.rollback(); return { ok: false, reason: "slot_conflict" }; }
    } else if (a.action === "counter") {
      if (!a.startsAt) { await conn.rollback(); return { ok: false, reason: "time_required" }; }
      const ctx = await loadContext(conn, m.expert);
      if (!isValidSlot({ ...ctx, durationMin: m.durationMin, now: a.now ?? new Date(), startsAt: a.startsAt })) { await conn.rollback(); return { ok: false, reason: "slot_invalid" }; }
      set.proposed_starts_at = a.startsAt;
    } else if (a.action === "visitor_accept") {
      const start = m.proposedStartsAt!;
      const end = endOf(start, m.durationMin);
      if (await hasConflict(conn, m.expert, start, end, m.id)) { await conn.rollback(); return { ok: false, reason: "slot_conflict" }; }
      Object.assign(set, { starts_at: start, ends_at: end, proposed_starts_at: null });
    } else if (a.action === "set_link") {
      if (!a.meetingUrl) { await conn.rollback(); return { ok: false, reason: "link_required" }; }
      set.meeting_url = a.meetingUrl;
    }
    await conn.query("UPDATE meeting_requests SET ? WHERE id = ?", [set, m.id]);
    await conn.query("INSERT INTO meeting_request_events (meeting_id, actor, actor_id, action, from_status, to_status, note) VALUES (?,?,?,?,?,?,?)",
      [m.id, a.actor, a.actorId ?? null, a.action, m.status, to, a.note ?? null]);
    const [fresh] = await conn.query<RowDataPacket[]>("SELECT * FROM meeting_requests WHERE id = ?", [m.id]);
    await conn.commit();
    return { ok: true, meeting: toRow(fresh[0]), from: m.status };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Admin: onaylanmış görüşmenin saatini ve/veya linkini günceller (ics sırası artar). */
export async function updateMeetingDetails(id: number, d: { startsAt?: string; meetingUrl?: string }, adminId?: number): Promise<ActionResult> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM meeting_requests WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) { await conn.rollback(); return { ok: false, reason: "not_found" }; }
    const m = toRow(rows[0]);
    if (m.status !== "confirmed") { await conn.rollback(); return { ok: false, reason: "invalid_transition" }; }
    const set: Record<string, unknown> = { ics_sequence: m.icsSequence + 1 };
    if (d.startsAt && d.startsAt !== m.startsAt) {
      const end = endOf(d.startsAt, m.durationMin);
      if (await hasConflict(conn, m.expert, d.startsAt, end, m.id)) { await conn.rollback(); return { ok: false, reason: "slot_conflict" }; }
      Object.assign(set, { starts_at: d.startsAt, ends_at: end });
    }
    if (d.meetingUrl) set.meeting_url = d.meetingUrl;
    await conn.query("UPDATE meeting_requests SET ? WHERE id = ?", [set, id]);
    await conn.query("INSERT INTO meeting_request_events (meeting_id, actor, actor_id, action, from_status, to_status) VALUES (?, 'admin', ?, 'update', 'confirmed', 'confirmed')", [id, adminId ?? null]);
    const [fresh] = await conn.query<RowDataPacket[]>("SELECT * FROM meeting_requests WHERE id = ?", [id]);
    await conn.commit();
    return { ok: true, meeting: toRow(fresh[0]), from: "confirmed" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listMeetings(f: { expert?: ExpertId; status?: MeetingStatus } = {}): Promise<MeetingRow[]> {
  const where: string[] = []; const params: unknown[] = [];
  if (f.expert) { where.push("expert = ?"); params.push(f.expert); }
  if (f.status) { where.push("status = ?"); params.push(f.status); }
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM meeting_requests ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY starts_at DESC LIMIT 500`, params);
  return rows.map(toRow);
}

export async function listRules(expert?: ExpertId) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM expert_availability_rules ${expert ? "WHERE expert = ?" : ""} ORDER BY id DESC`, expert ? [expert] : []);
  return rows.map(toRule);
}

export async function createRule(r: RuleInput): Promise<number> {
  const startsOn = r.recurrence === "once" ? r.date! : r.startsOn!;
  const [res] = await pool.query<ResultSetHeader>(
    `INSERT INTO expert_availability_rules (expert, kind, recurrence, date, starts_on, until, weekdays, start_time, end_time, note) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [r.expert, r.kind, r.recurrence, r.recurrence === "once" ? r.date : null, startsOn, r.until ?? null, r.recurrence === "weekly" ? r.weekdays : 0, r.startTime, r.endTime, r.note ?? null]);
  return res.insertId;
}

export async function deleteRule(id: number): Promise<boolean> {
  const [res] = await pool.query<ResultSetHeader>("DELETE FROM expert_availability_rules WHERE id = ?", [id]);
  return res.affectedRows > 0;
}

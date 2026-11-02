import "server-only";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { sendLessonQuestionEmail } from "@/lib/mail";

export const COMMENT_MAX = 2000;
/** Bir kullanıcı dakikada en çok bu kadar yorum yazabilir (e-posta bombardımanını sınırlar). */
const PER_MINUTE = 5;

export type Instructor = { id: number; full_name: string; role: "instructor" | "admin" };

/** Ders eğitmeni olarak atanabilecek aktif kullanıcılar (eğitmen + yönetici). */
export async function listInstructors(): Promise<Instructor[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, full_name, role FROM users WHERE role IN ('instructor','admin') AND is_active = 1 ORDER BY full_name",
  );
  return rows as Instructor[];
}

export async function isStaffUser(userId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM users WHERE id = ? AND role IN ('instructor','admin') AND is_active = 1",
    [userId],
  );
  return rows.length > 0;
}

export type CommentNode = {
  id: number;
  parent_id: number | null;
  body: string;
  created_at: string;
  author: string;
  isStaff: boolean;
  mine: boolean;
};

/** Dersin soru/cevap akışı: önce sorular (yeniden eskiye), her sorunun cevapları eskiden yeniye. */
export async function listLessonComments(lessonId: number, viewerId?: number): Promise<{ question: CommentNode; replies: CommentNode[] }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.parent_id, c.body, c.created_at, c.user_id, u.full_name, u.role
       FROM lesson_comments c JOIN users u ON u.id = c.user_id
      WHERE c.lesson_id = ? ORDER BY c.id`,
    [lessonId],
  );
  const toNode = (r: RowDataPacket): CommentNode => ({
    id: r.id,
    parent_id: r.parent_id,
    body: r.body,
    created_at: new Date(r.created_at).toISOString(),
    author: r.full_name,
    isStaff: r.role !== "user",
    mine: r.user_id === viewerId,
  });
  const nodes = rows.map(toNode);
  return nodes
    .filter((n) => n.parent_id === null)
    .reverse()
    .map((question) => ({ question, replies: nodes.filter((n) => n.parent_id === question.id) }));
}

export async function tooManyComments(userId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM lesson_comments WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 MINUTE",
    [userId],
  );
  return Number(rows[0].n) >= PER_MINUTE;
}

/** Eğitmen bu dersin sorularını yanıtlayabilir mi? Yönetici hepsini, eğitmen yalnızca atandığı dersleri. */
export async function canAnswerLesson(user: { id: number; role: string }, lessonId: number): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role !== "instructor") return false;
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM lessons WHERE id = ? AND instructor_id = ?", [lessonId, user.id]);
  return rows.length > 0;
}

/** Soru bildirimi alacak adresler: dersin eğitmeni; atanmamış (ya da pasif) ise tüm aktif yöneticiler. */
async function questionRecipients(lessonId: number): Promise<string[]> {
  const [own] = await pool.query<RowDataPacket[]>(
    "SELECT u.email FROM lessons l JOIN users u ON u.id = l.instructor_id WHERE l.id = ? AND u.is_active = 1",
    [lessonId],
  );
  if (own.length > 0) return [own[0].email];
  const [admins] = await pool.query<RowDataPacket[]>("SELECT email FROM users WHERE role = 'admin' AND is_active = 1");
  return admins.map((a) => a.email);
}

/** Bildirim hatası yorumun kaydını bozmaz: yalnızca loglanır (SMTP geçici olarak düşmüş olabilir). */
export async function notifyQuestion(lessonId: number, q: { studentName: string; body: string; baseUrl: string; commentId: number }) {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT l.title AS lesson_title, c.title AS course_title FROM lessons l JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.id = ?",
      [lessonId],
    );
    if (rows.length === 0) return;
    const url = `${q.baseUrl}/egitmen/sorular?soru=${q.commentId}`;
    const mail = { studentName: q.studentName, courseTitle: rows[0].course_title, lessonTitle: rows[0].lesson_title, body: q.body, url };
    // CC adresi birden fazla yöneticiye giden aynı bildirimin her kopyasında değil, yalnızca ilkinde olsun.
    const recipients = await questionRecipients(lessonId);
    for (const [i, to] of recipients.entries()) await sendLessonQuestionEmail(to, mail, i === 0);
  } catch (err) {
    console.error("[notifyQuestion]", err);
  }
}

export type StaffThread = {
  question: CommentNode;
  replies: CommentNode[];
  lessonId: number;
  lessonTitle: string;
  courseTitle: string;
  courseSlug: string;
  answered: boolean;
};

/** Eğitmen paneli: eğitmenin kendi derslerindeki (yönetici için tüm derslerdeki) sorular; cevap bekleyenler önce. */
export async function listStaffThreads(user: { id: number; role: string }): Promise<StaffThread[]> {
  const [qs] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.lesson_id, c.body, c.created_at, c.user_id, u.full_name, u.role,
            l.title AS lesson_title, cr.title AS course_title, cr.slug AS course_slug
       FROM lesson_comments c
       JOIN users u ON u.id = c.user_id
       JOIN lessons l ON l.id = c.lesson_id
       JOIN modules m ON m.id = l.module_id
       JOIN courses cr ON cr.id = m.course_id
      WHERE c.parent_id IS NULL ${user.role === "admin" ? "" : "AND l.instructor_id = ?"}
      ORDER BY c.id DESC LIMIT 200`,
    user.role === "admin" ? [] : [user.id],
  );
  if (qs.length === 0) return [];
  const [rs] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.parent_id, c.body, c.created_at, c.user_id, u.full_name, u.role
       FROM lesson_comments c JOIN users u ON u.id = c.user_id
      WHERE c.parent_id IN (?) ORDER BY c.id`,
    [qs.map((q) => q.id)],
  );
  const toNode = (r: RowDataPacket): CommentNode => ({
    id: r.id, parent_id: r.parent_id ?? null, body: r.body, created_at: new Date(r.created_at).toISOString(),
    author: r.full_name, isStaff: r.role !== "user", mine: r.user_id === user.id,
  });
  const threads = qs.map((q): StaffThread => {
    const replies = rs.filter((r) => r.parent_id === q.id).map(toNode);
    return {
      question: toNode(q), replies, lessonId: q.lesson_id, lessonTitle: q.lesson_title, courseTitle: q.course_title, courseSlug: q.course_slug,
      answered: replies.some((r) => r.isStaff),
    };
  });
  // Cevap bekleyenler önce; kendi içinde yeniden eskiye (sort kararlı).
  return threads.sort((a, b) => Number(a.answered) - Number(b.answered));
}

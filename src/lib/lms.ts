// LMS veri erişimi (x-plore sorgularından uyarlandı). Ham SQL — mysql2 havuzu.
import "server-only";
import { after } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { activateGiftForOrder, sendGiftEmails } from "@/lib/gifts";
import { giftOrderLabel } from "@/lib/gift-rules";
import { sendOrderReceipt } from "@/lib/order-receipt";
import { enrollInProgram, ensureProgramProgress } from "@/lib/programs";
import { FREE_PREVIEW_LESSONS } from "@/lib/preview";
import type { LessonFileItem } from "@/lib/lesson-files";

export type CourseRow = {
  id: number;
  slug: string;
  code: string;
  title: string;
  description: string;
  category: string;
  level: string;
  instructor: string;
  hours: number;
  rating: string | null;
  price: number;
  old_price: number | null;
  outcomes: string[];
  thumbnail_url: string | null;
  is_published: boolean;
  module_count: number;
  lesson_count: number;
};

const COURSE_COLUMNS = `c.id, c.slug, c.code, c.title, c.description, c.category, c.level, c.instructor, c.hours,
  c.rating, c.price, c.old_price, c.outcomes, c.thumbnail_url, c.is_published,
  (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS module_count,
  (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lesson_count`;

function mapCourse(r: RowDataPacket): CourseRow {
  let outcomes: string[] = [];
  try {
    const parsed = r.outcomes ? JSON.parse(r.outcomes) : [];
    if (Array.isArray(parsed)) outcomes = parsed.map(String);
  } catch {
    /* bozuk JSON → boş liste */
  }
  return {
    id: r.id,
    slug: r.slug,
    code: r.code,
    title: r.title,
    description: r.description,
    category: r.category,
    level: r.level,
    instructor: r.instructor,
    hours: r.hours,
    rating: r.rating,
    price: Number(r.price),
    old_price: r.old_price == null ? null : Number(r.old_price),
    outcomes,
    thumbnail_url: r.thumbnail_url,
    is_published: !!r.is_published,
    module_count: Number(r.module_count),
    lesson_count: Number(r.lesson_count),
  };
}

export async function listPublishedCourses(): Promise<CourseRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${COURSE_COLUMNS} FROM courses c WHERE c.is_published = 1 ORDER BY c.sort_order, c.id`,
  );
  return rows.map(mapCourse);
}

export async function listAllCourses(): Promise<CourseRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${COURSE_COLUMNS} FROM courses c ORDER BY c.sort_order, c.id`,
  );
  return rows.map(mapCourse);
}

/** Kurslarda kullanılan benzersiz kategoriler (alfabetik). */
export async function listCategories(): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT DISTINCT category FROM courses WHERE category <> '' ORDER BY category",
  );
  return rows.map((r) => r.category as string);
}

export async function getCourseBySlug(slug: string, opts: { includeDraft?: boolean } = {}): Promise<CourseRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${COURSE_COLUMNS} FROM courses c WHERE c.slug = ? ${opts.includeDraft ? "" : "AND c.is_published = 1"} LIMIT 1`,
    [slug],
  );
  return rows[0] ? mapCourse(rows[0]) : null;
}

export async function getCourseById(id: number): Promise<CourseRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT ${COURSE_COLUMNS} FROM courses c WHERE c.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapCourse(rows[0]) : null;
}

// ── Müfredat ağacı ────────────────────────────────────────────────────────────
export type LessonNode = { id: number; title: string; lesson_type: "video" | "text"; duration_minutes: number | null; sort_order: number; completed?: boolean };
/**
 * Sınavda öğrenciye gösterilen soru sayısı (SQL ifadesi): havuz modunda `draw_count`, değilse (ya da NULL = hepsi) puanlanan soru sayısı.
 * `alias`: quizzes tablosunun sorgudaki adı.
 */
export const quizShownCountSql = (alias: string) =>
  `IF(${alias}.mode = 'pool' AND ${alias}.draw_count IS NOT NULL, ${alias}.draw_count, (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = ${alias}.id AND x.type <> 'scenario'))`;

export type QuizNode = { id: number; title: string; module_id: number | null; passing_score_percentage: number; question_count: number; passed?: boolean };
export type ModuleNode = { id: number; title: string; sort_order: number; lessons: LessonNode[]; quiz: QuizNode | null };
export type CourseTree = { modules: ModuleNode[]; finalQuiz: QuizNode | null };

/** İçerik (video ID / Markdown) bilerek dahil edilmez — yalnızca iskelet. */
export async function getCourseTree(courseId: number, userId?: number): Promise<CourseTree> {
  const [modRows] = await pool.query<RowDataPacket[]>(
    "SELECT id, title, sort_order FROM modules WHERE course_id = ? ORDER BY sort_order, id",
    [courseId],
  );
  const [lessonRows] = await pool.query<RowDataPacket[]>(
    `SELECT l.id, l.module_id, l.title, l.lesson_type, l.duration_minutes, l.sort_order
       FROM lessons l JOIN modules m ON m.id = l.module_id
      WHERE m.course_id = ? ORDER BY l.sort_order, l.id`,
    [courseId],
  );
  const [quizRows] = await pool.query<RowDataPacket[]>(
    `SELECT q.id, q.title, q.module_id, q.passing_score_percentage,
            ${quizShownCountSql("q")} AS question_count
       FROM quizzes q WHERE q.course_id = ? ORDER BY q.id`,
    [courseId],
  );

  const completed = new Set<number>();
  const passed = new Set<number>();
  if (userId) {
    const [p] = await pool.query<RowDataPacket[]>(
      `SELECT lp.lesson_id FROM lesson_progress lp
         JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
        WHERE lp.user_id = ? AND m.course_id = ?`,
      [userId, courseId],
    );
    p.forEach((r) => completed.add(r.lesson_id));
    const [a] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT qa.quiz_id FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.user_id = ? AND q.course_id = ? AND qa.is_passed = 1`,
      [userId, courseId],
    );
    a.forEach((r) => passed.add(r.quiz_id));
  }

  const toQuiz = (r: RowDataPacket): QuizNode => ({
    id: r.id,
    title: r.title,
    module_id: r.module_id,
    passing_score_percentage: r.passing_score_percentage,
    question_count: Number(r.question_count),
    passed: userId ? passed.has(r.id) : undefined,
  });

  const modules: ModuleNode[] = modRows.map((m) => ({
    id: m.id,
    title: m.title,
    sort_order: m.sort_order,
    lessons: lessonRows
      .filter((l) => l.module_id === m.id)
      .map((l) => ({
        id: l.id,
        title: l.title,
        lesson_type: l.lesson_type,
        duration_minutes: l.duration_minutes,
        sort_order: l.sort_order,
        completed: userId ? completed.has(l.id) : undefined,
      })),
    quiz: quizRows.filter((q) => q.module_id === m.id).map(toQuiz)[0] ?? null,
  }));
  const finalQuiz = quizRows.filter((q) => q.module_id === null).map(toQuiz)[0] ?? null;
  return { modules, finalQuiz };
}

// ── Erişim ────────────────────────────────────────────────────────────────────
export type EnrollmentSource = "admin" | "purchase" | "plus" | "gift";

export async function grantEnrollment(userId: number, courseId: number, source: EnrollmentSource): Promise<boolean> {
  const [res] = await pool.execute<ResultSetHeader>(
    "INSERT IGNORE INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', ?)",
    [userId, courseId, source],
  );
  return res.affectedRows > 0;
}

export async function hasPlus(userId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM users WHERE id = ? AND plus_until > NOW()", [userId]);
  return rows.length > 0;
}

/**
 * Kullanıcının kursa erişimi var mı? (BOLA koruması)
 *  1) kayıt satırı (aktif ya da tamamlanmış — tamamlanan kurs salt-okunur incelenebilsin)
 *  2) aktif Profect Plus → yayınlanmış her kursa erişim; kayıt satırı o an oluşturulur
 */
export async function canAccessCourse(userId: number, courseId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1",
    [userId, courseId],
  );
  if (rows.length > 0) return true;
  if (!(await hasPlus(userId))) return false;
  const [c] = await pool.query<RowDataPacket[]>("SELECT 1 FROM courses WHERE id = ? AND is_published = 1", [courseId]);
  if (c.length === 0) return false;
  await grantEnrollment(userId, courseId, "plus");
  return true;
}

/** Kullanıcının erişimi olan kurs id'leri (liste sayfalarında tek sorguyla; Plus ise yayınlanmış her kurs). */
export async function listAccessibleCourseIds(userId: number): Promise<Set<number>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT course_id AS id FROM enrollments WHERE user_id = ?
     ${(await hasPlus(userId)) ? "UNION SELECT id FROM courses WHERE is_published = 1" : ""}`,
    [userId],
  );
  return new Set(rows.map((r) => Number(r.id)));
}

/** Ders, yayınlanmış bir kursun ücretsiz önizleme derslerinden biri mi? (müfredat sırası: previewLessonIds ile aynı) */
export async function isPreviewLesson(courseId: number, lessonId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT l.id FROM lessons l
       JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id
      WHERE m.course_id = ? AND c.is_published = 1
      ORDER BY m.sort_order, m.id, l.sort_order, l.id LIMIT ${FREE_PREVIEW_LESSONS}`,
    [courseId],
  );
  return rows.some((r) => r.id === lessonId);
}

/** Sınav sayısı (soru içeren) ve kullanıcının geçtiği sınav sayısı; soru içermeyen sınav geçilemez, sayılmaz. */
const QUIZ_TOTAL_SQL = `(SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id
    AND EXISTS (SELECT 1 FROM questions qu WHERE qu.quiz_id = q.id AND qu.type <> 'scenario'))`;
const QUIZ_PASSED_SQL = `(SELECT COUNT(DISTINCT qa.quiz_id) FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
    WHERE qa.user_id = ? AND q.course_id = c.id AND qa.is_passed = 1
      AND EXISTS (SELECT 1 FROM questions qu WHERE qu.quiz_id = q.id AND qu.type <> 'scenario'))`;

// ── İlerleme ──────────────────────────────────────────────────────────────────
/** İlerleme = (tamamlanan ders + geçilen sınav) / (toplam ders + toplam sınav). */
export async function getCourseProgress(userId: number, courseId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
        (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS total_lessons,
        (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
           JOIN modules m ON m.id = l.module_id WHERE lp.user_id = ? AND m.course_id = c.id) AS done_lessons,
        ${QUIZ_TOTAL_SQL} AS total_quizzes,
        ${QUIZ_PASSED_SQL} AS passed_quizzes
       FROM courses c WHERE c.id = ?`,
    [userId, userId, courseId],
  );
  const r = rows[0];
  const totalLessons = Number(r?.total_lessons ?? 0);
  const completedLessons = Number(r?.done_lessons ?? 0);
  const total = totalLessons + Number(r?.total_quizzes ?? 0);
  const done = completedLessons + Number(r?.passed_quizzes ?? 0);
  return { totalLessons, completedLessons, percentage: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0 };
}

export type MyCourse = CourseRow & {
  status: "active" | "completed";
  enrolled_at: string;
  source: EnrollmentSource;
  percentage: number;
  completed_lessons: number;
  certificate_code: string | null;
};

function myPercentage(done: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

export async function listMyCourses(userId: number): Promise<MyCourse[]> {
  // Plus abonesi için yayınlanmış her kurs "açık"; kayıt satırı yoksa listede aktif görünür.
  const plus = await hasPlus(userId);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${COURSE_COLUMNS},
            e.status AS e_status, e.enrolled_at AS e_enrolled_at, e.source AS e_source,
            (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
               JOIN modules m ON m.id = l.module_id WHERE lp.user_id = ? AND m.course_id = c.id) AS completed_lessons,
            ${QUIZ_TOTAL_SQL} AS total_quizzes,
            ${QUIZ_PASSED_SQL} AS passed_quizzes,
            cert.certificate_code
       FROM courses c
       LEFT JOIN enrollments e ON e.course_id = c.id AND e.user_id = ?
       LEFT JOIN certificates cert ON cert.course_id = c.id AND cert.user_id = ?
      WHERE (e.id IS NOT NULL ${plus ? "OR c.is_published = 1" : ""})
      ORDER BY (e.status = 'completed'), e.enrolled_at DESC, c.sort_order`,
    [userId, userId, userId, userId],
  );
  return rows.map((r) => {
    const base = mapCourse(r);
    const done = Number(r.completed_lessons);
    return {
      ...base,
      status: (r.e_status ?? "active") as "active" | "completed",
      enrolled_at: r.e_enrolled_at ?? "",
      source: (r.e_source ?? "plus") as EnrollmentSource,
      completed_lessons: done,
      percentage: myPercentage(done + Number(r.passed_quizzes), base.lesson_count + Number(r.total_quizzes)),
      certificate_code: r.certificate_code ?? null,
    };
  });
}

export function shuffle<T>(input: T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Modülün başlığı ve kursunun slug'ı (R2 klasör yolu için). */
export async function getModuleForKey(moduleId: number): Promise<{ id: number; title: string; course_slug: string } | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT m.id, m.title, c.slug AS course_slug FROM modules m JOIN courses c ON c.id = m.course_id WHERE m.id = ?",
    [moduleId],
  );
  return (rows[0] as { id: number; title: string; course_slug: string } | undefined) ?? null;
}

// ── Siparişler ────────────────────────────────────────────────────────────────
export const PLUS_PRICE = 449;
export const PLUS_DAYS = 30;

/** Siparişi "ödendi" yapar ve erişimi verir. Zaten ödenmişse hiçbir şey yapmaz (idempotent). */
export async function fulfillOrder(orderId: number): Promise<{ ok: boolean; reason?: string }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>("SELECT * FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    const o = rows[0];
    if (!o) {
      await conn.rollback();
      return { ok: false, reason: "Sipariş bulunamadı." };
    }
    if (o.status === "paid") {
      await conn.rollback();
      return { ok: true };
    }
    await conn.execute("UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = ?", [orderId]);
    // Hediye siparişinde kurs siparişi verene DEĞİL, alıcıya gider: burada yalnızca hediye aktive edilir (token + mailler).
    const gift = await activateGiftForOrder(conn, orderId);
    const [items] = await conn.query<RowDataPacket[]>("SELECT item_type, course_id, program_id FROM order_items WHERE order_id = ?", [orderId]);
    type Line = { item_type: "course" | "plus" | "program"; course_id: number | null; program_id: number | null };
    // Eski (tek kalemli) siparişlerde kalem satırı yoktur: plan/course_id alanlarından türetilir.
    const lines: Line[] = items.length
      ? (items as Line[])
      : o.plan === "plus"
        ? [{ item_type: "plus", course_id: null, program_id: null }]
        : o.course_id
          ? [{ item_type: "course", course_id: o.course_id, program_id: null }]
          : [];
    if (o.coupon_id) {
      // UNIQUE(order_id) → sipariş yeniden onaylansa da kupon bir kez sayılır.
      await conn.execute("INSERT IGNORE INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount) VALUES (?, ?, ?, ?)", [o.coupon_id, o.user_id, orderId, o.discount_amount ?? 0]);
    }
    const programIds: number[] = [];
    for (const line of gift ? [] : lines) {
      if (line.item_type === "course" && line.course_id) {
        await conn.execute("INSERT IGNORE INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'purchase')", [o.user_id, line.course_id]);
      } else if (line.item_type === "program" && line.program_id) {
        // Ödeme anındaki tüm program kursları (current program_courses) kalıcı erişimle yazılır; Plus kayıtları yükseltilir.
        await enrollInProgram(conn, o.user_id, line.program_id, "purchase");
        programIds.push(line.program_id);
      } else if (line.item_type === "plus") {
        await conn.execute(
          "UPDATE users SET plus_until = DATE_ADD(GREATEST(NOW(), COALESCE(plus_until, NOW())), INTERVAL ? DAY) WHERE id = ?",
          [PLUS_DAYS, o.user_id],
        );
      }
    }
    await conn.commit();
    // Kullanıcı program kurslarını daha önce bitirmiş olabilir: commit sonrası sertifika kontrolü (hatası siparişi bozmaz).
    for (const programId of programIds) after(() => ensureProgramProgress(o.user_id, { programId }).catch(console.error));
    after(() => sendOrderReceipt(orderId)); // yalnızca ilk ödeme geçişinde; yanıtı geciktirmez, hatası siparişi bozmaz
    if (gift) after(() => sendGiftEmails(gift.giftId, gift.token)); // ham token yalnızca bu kapanışta ve mailde yaşar
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Sertifika ─────────────────────────────────────────────────────────────────
export function generateCertificateCode(): string {
  const n = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `PRF-${new Date().getFullYear()}-${n}`;
}

// ── Ders / sertifika okuma (sayfalar için) ────────────────────────────────────
export type LessonFull = {
  id: number;
  title: string;
  lesson_type: "video" | "text";
  content: string;
  duration_minutes: number | null;
  module_id: number;
  module_title: string;
  course_id: number;
};

export async function getLesson(lessonId: number): Promise<LessonFull | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT l.id, l.title, l.lesson_type, l.content, l.duration_minutes, l.module_id, m.title AS module_title, m.course_id
       FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?`,
    [lessonId],
  );
  return (rows[0] as LessonFull | undefined) ?? null;
}

/** Müfredatın doğrusal sırası: modül dersleri → modül sınavı → … → final sınavı. */
export type FlowItem = { kind: "lesson" | "quiz"; id: number; title: string; done: boolean };
export function flattenTree(tree: CourseTree): FlowItem[] {
  const out: FlowItem[] = [];
  for (const m of tree.modules) {
    for (const l of m.lessons) out.push({ kind: "lesson", id: l.id, title: l.title, done: !!l.completed });
    if (m.quiz) out.push({ kind: "quiz", id: m.quiz.id, title: m.quiz.title, done: !!m.quiz.passed });
  }
  if (tree.finalQuiz) out.push({ kind: "quiz", id: tree.finalQuiz.id, title: tree.finalQuiz.title, done: !!tree.finalQuiz.passed });
  return out;
}

export type CertificateRow = {
  /** `course`: kurs sertifikası · `program`: Uzmanlık Programı sertifikası (course_title = program adı). */
  kind: "course" | "program";
  certificate_code: string;
  issued_at: string;
  score: number | null;
  student_name: string;
  course_title: string;
  course_minutes: number;
  instructor: string;
  /** Program sertifikasında programın tüm kurs adları (program sırasıyla); kurs sertifikasında boş. */
  included_courses: string[];
};

/** Kursun toplam süresi (dk): tüm derslerin + tüm sınavların süreleri. `cr` = courses takma adı. */
export const COURSE_MINUTES_SQL = `(
  (SELECT COALESCE(SUM(l.duration_minutes), 0) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = cr.id) +
  (SELECT COALESCE(SUM(q.duration_minutes), 0) FROM quizzes q WHERE q.course_id = cr.id)
)`;

export async function getCertificateByCode(code: string): Promise<CertificateRow | null> {
  const normalized = code.trim().toUpperCase();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.certificate_code, c.issued_at, c.score, u.full_name AS student_name,
            cr.title AS course_title, cr.instructor,
            ${COURSE_MINUTES_SQL} AS course_minutes
       FROM certificates c JOIN users u ON u.id = c.user_id JOIN courses cr ON cr.id = c.course_id
      WHERE c.certificate_code = ?`,
    [normalized],
  );
  const row = rows[0];
  if (row) {
    return {
      kind: "course",
      certificate_code: row.certificate_code,
      issued_at: row.issued_at,
      score: row.score,
      student_name: row.student_name,
      course_title: row.course_title,
      course_minutes: Number(row.course_minutes),
      instructor: row.instructor,
      included_courses: [],
    };
  }

  // Program sertifikası: program adı, kursların toplam süresi; eğitmen/puan yok. Kurs yayından kalksa da okunur.
  const [prog] = await pool.query<RowDataPacket[]>(
    `SELECT pc.certificate_code, pc.issued_at, u.full_name AS student_name, p.id AS program_id, p.title AS course_title,
            (SELECT COALESCE(SUM(${COURSE_MINUTES_SQL}), 0) FROM program_courses pcc JOIN courses cr ON cr.id = pcc.course_id WHERE pcc.program_id = p.id) AS course_minutes
       FROM program_certificates pc JOIN users u ON u.id = pc.user_id JOIN programs p ON p.id = pc.program_id
      WHERE pc.certificate_code = ?`,
    [normalized],
  );
  const pr = prog[0];
  if (!pr) return null;
  const [included] = await pool.query<RowDataPacket[]>(
    "SELECT cr.title FROM program_courses pcc JOIN courses cr ON cr.id = pcc.course_id WHERE pcc.program_id = ? ORDER BY pcc.sort_order, cr.id",
    [pr.program_id],
  );
  return {
    kind: "program",
    certificate_code: pr.certificate_code,
    issued_at: pr.issued_at,
    score: null,
    student_name: pr.student_name,
    course_title: pr.course_title,
    course_minutes: Number(pr.course_minutes),
    instructor: "",
    included_courses: included.map((r) => r.title as string),
  };
}

export type MyCertificate = {
  kind: "course" | "program";
  certificate_code: string;
  issued_at: string;
  score: number | null;
  course_title: string;
  slug: string;
};

/** Kurs ve program sertifikaları birlikte, yeniden eskiye. `course_title` programda program adıdır. */
export async function listMyCertificates(userId: number): Promise<MyCertificate[]> {
  const [[courseRows], [programRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT 'course' AS kind, c.certificate_code, c.issued_at, c.score, cr.title AS course_title, cr.slug
         FROM certificates c JOIN courses cr ON cr.id = c.course_id WHERE c.user_id = ?`,
      [userId],
    ),
    pool.query<RowDataPacket[]>(
      `SELECT 'program' AS kind, pc.certificate_code, pc.issued_at, NULL AS score, p.title AS course_title, p.slug
         FROM program_certificates pc JOIN programs p ON p.id = pc.program_id WHERE pc.user_id = ?`,
      [userId],
    ),
  ]);
  return ([...courseRows, ...programRows] as MyCertificate[]).sort((a, b) => (a.issued_at < b.issued_at ? 1 : a.issued_at > b.issued_at ? -1 : 0));
}

/** Sipariş kalemlerinin okunur özeti: "Kurs A, Kurs B + Profect Plus". Kalem satırı olmayan eski siparişler için null. */
export const ORDER_ITEMS_SUMMARY_SQL = `(SELECT GROUP_CONCAT(oi.title ORDER BY oi.id SEPARATOR ' · ') FROM order_items oi WHERE oi.order_id = o.id)`;

/** Siparişe bağlı hediye varsa alıcının e-postası (hediye siparişi değilse NULL). */
export const ORDER_GIFT_TO_SQL = `(SELECT g.recipient_email FROM gifts g WHERE g.order_id = o.id)`;

export type MyOrder = { id: number; plan: "single" | "plus" | "cart"; amount: string; status: "pending" | "paid" | "rejected"; created_at: string; course_title: string | null; items_summary: string | null; gift_to: string | null };

export async function listMyOrders(userId: number): Promise<MyOrder[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT o.id, o.plan, o.amount, o.status, o.created_at, c.title AS course_title, ${ORDER_ITEMS_SUMMARY_SQL} AS items_summary, ${ORDER_GIFT_TO_SQL} AS gift_to
       FROM orders o LEFT JOIN courses c ON c.id = o.course_id WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 50`,
    [userId],
  );
  return rows as MyOrder[];
}

/** Sipariş ürün adı (eski ve yeni siparişler için tek yerden). */
export function orderLabel(o: { plan: "single" | "plus" | "cart"; course_title: string | null; items_summary: string | null; gift_to?: string | null }): string {
  return giftOrderLabel(o.items_summary ?? (o.plan === "plus" ? "Profect Plus (aylık)" : o.course_title ?? "—"), o.gift_to);
}

export type MyOrderItem = { type: "course" | "plus" | "program"; title: string; price: number; href: string | null };
export type MyOrderDetail = {
  id: number;
  status: "pending" | "paid" | "rejected";
  provider: string;
  created_at: string;
  paid_at: string | null;
  items: MyOrderItem[];
  subtotal: number;
  coupon_code: string | null;
  discount: number;
  total: number;
  masked_card: string | null;
  error_message: string | null;
  invoice: { type: "bireysel" | "kurumsal" | null; full_name: string | null; email: string | null; phone: string | null; tckn: string | null; company_name: string | null; tax_office: string | null; tax_number: string | null; address: string | null; city: string | null; district: string | null; zip_code: string | null };
  gift: { recipient_email: string; status: "awaiting_payment" | "pending" | "claimed" | "expired" | "cancelled" } | null;
};

/** Kullanıcının kendi siparişinin tam dökümü (başkasının siparişi için null → 404). Kalem satırı olmayan eski siparişler tek kalem olarak türetilir. */
export async function getMyOrderDetail(userId: number, orderId: number): Promise<MyOrderDetail | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT o.id, o.plan, o.amount, o.status, o.provider, o.created_at, o.paid_at, o.masked_card, o.error_message, o.coupon_code, o.discount_amount,
            o.invoice_type, o.full_name, o.email, o.phone, o.tckn, o.company_name, o.tax_office, o.tax_number, o.address, o.city, o.district, o.zip_code,
            c.title AS course_title, c.slug AS course_slug
       FROM orders o LEFT JOIN courses c ON c.id = o.course_id WHERE o.id = ? AND o.user_id = ?`,
    [orderId, userId],
  );
  const o = rows[0];
  if (!o) return null;
  const [itemRows] = await pool.query<RowDataPacket[]>(
    `SELECT oi.item_type, oi.title, oi.unit_price, c.slug AS course_slug, p.slug AS program_slug
       FROM order_items oi LEFT JOIN courses c ON c.id = oi.course_id LEFT JOIN programs p ON p.id = oi.program_id
      WHERE oi.order_id = ? ORDER BY oi.id`,
    [orderId],
  );
  const discount = Number(o.discount_amount ?? 0);
  let items: MyOrderItem[] = itemRows.map((i) => ({
    type: i.item_type,
    title: i.title,
    price: Number(i.unit_price),
    href: i.item_type === "course" && i.course_slug ? `/kurslar/${i.course_slug}` : i.item_type === "program" && i.program_slug ? `/programlar/${i.program_slug}` : i.item_type === "plus" ? "/hesabim/abonelik" : null,
  }));
  if (items.length === 0) {
    const plus = o.plan === "plus";
    items = [{ type: plus ? "plus" : "course", title: plus ? "Profect Plus (aylık)" : (o.course_title ?? "Kurs"), price: Number(o.amount) + discount, href: plus ? "/hesabim/abonelik" : o.course_slug ? `/kurslar/${o.course_slug}` : null }];
  }
  const [giftRows] = await pool.query<RowDataPacket[]>("SELECT recipient_email, status FROM gifts WHERE order_id = ?", [orderId]);
  return {
    id: o.id,
    status: o.status,
    provider: o.provider,
    created_at: o.created_at,
    paid_at: o.paid_at,
    items,
    subtotal: items.reduce((s, i) => s + i.price, 0),
    coupon_code: o.coupon_code,
    discount,
    total: Number(o.amount),
    masked_card: o.masked_card,
    error_message: o.error_message,
    invoice: { type: o.invoice_type, full_name: o.full_name, email: o.email, phone: o.phone, tckn: o.tckn, company_name: o.company_name, tax_office: o.tax_office, tax_number: o.tax_number, address: o.address, city: o.city, district: o.district, zip_code: o.zip_code },
    gift: giftRows[0] ? { recipient_email: giftRows[0].recipient_email, status: giftRows[0].status } : null,
  };
}

export type AccountProfile = { full_name: string; email: string; phone: string | null; email_verified: boolean; created_at: string };

export async function getAccountProfile(userId: number): Promise<AccountProfile | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT full_name, email, phone, email_verified, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at FROM users WHERE id = ?",
    [userId],
  );
  const r = rows[0];
  return r ? { full_name: r.full_name, email: r.email, phone: r.phone, email_verified: !!r.email_verified, created_at: r.created_at } : null;
}

/** Profect Plus durumu: bitiş tarihi + bekleyen (henüz onaylanmamış) Plus siparişi var mı. */
export async function getPlusInfo(userId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(plus_until, '%Y-%m-%d %H:%i:%s') AS plus_until, (plus_until > NOW()) AS active,
            EXISTS(SELECT 1 FROM orders o WHERE o.user_id = users.id AND o.status = 'pending' AND (o.plan = 'plus' OR EXISTS(SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.item_type = 'plus'))) AS pending_order
       FROM users WHERE id = ?`,
    [userId],
  );
  const r = rows[0];
  return { until: (r?.plus_until ?? null) as string | null, active: !!r?.active, pendingOrder: !!r?.pending_order };
}

// ── Yönetici görünümü (içerik dahil) ──────────────────────────────────────────
export type AdminLesson = { id: number; module_id: number; title: string; lesson_type: "video" | "text"; content: string; duration_minutes: number | null; instructor_id: number | null; sort_order: number; files: LessonFileItem[] };
export type AdminQuizRef = { id: number; title: string; module_id: number | null; passing_score_percentage: number; question_count: number; pool_count: number };
export type AdminModule = { id: number; title: string; sort_order: number; lessons: AdminLesson[]; quiz: AdminQuizRef | null };

export async function getCourseAdminTree(courseId: number) {
  const course = await getCourseById(courseId);
  if (!course) return null;
  const [modules] = await pool.query<RowDataPacket[]>("SELECT id, title, sort_order FROM modules WHERE course_id = ? ORDER BY sort_order, id", [courseId]);
  const [lessons] = await pool.query<RowDataPacket[]>(
    `SELECT l.id, l.module_id, l.title, l.lesson_type, l.content, l.duration_minutes, l.instructor_id, l.sort_order
       FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ? ORDER BY l.sort_order, l.id`,
    [courseId],
  );
  const [fileRows] = lessons.length
    ? await pool.query<RowDataPacket[]>(
        "SELECT id, lesson_id, title, file_name, size_bytes FROM lesson_files WHERE lesson_id IN (?) ORDER BY created_at, id",
        [lessons.map((l) => l.id)],
      )
    : [[] as RowDataPacket[]];
  const filesOf = (lessonId: number): LessonFileItem[] =>
    fileRows.filter((f) => f.lesson_id === lessonId).map((f) => ({ id: f.id, title: f.title, file_name: f.file_name, size_bytes: Number(f.size_bytes) }));
  const [quizzes] = await pool.query<RowDataPacket[]>(
    `SELECT q.id, q.title, q.module_id, q.passing_score_percentage,
            ${quizShownCountSql("q")} AS question_count,
            (SELECT COUNT(*) FROM questions p WHERE p.quiz_id = q.id AND p.type <> 'scenario') AS pool_count
       FROM quizzes q WHERE q.course_id = ?`,
    [courseId],
  );
  const toQuiz = (q: RowDataPacket): AdminQuizRef => ({ id: q.id, title: q.title, module_id: q.module_id, passing_score_percentage: q.passing_score_percentage, question_count: Number(q.question_count), pool_count: Number(q.pool_count) });
  return {
    course,
    modules: modules.map((m): AdminModule => ({
      id: m.id,
      title: m.title,
      sort_order: m.sort_order,
      lessons: lessons.filter((l) => l.module_id === m.id).map((l) => ({ ...l, files: filesOf(l.id) }) as AdminLesson),
      quiz: quizzes.filter((q) => q.module_id === m.id).map(toQuiz)[0] ?? null,
    })),
    finalQuiz: quizzes.filter((q) => q.module_id === null).map(toQuiz)[0] ?? null,
  };
}

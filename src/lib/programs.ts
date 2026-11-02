// Uzmanlık Programı (kurs paketi) veri erişimi. Ham SQL — mysql2 havuzu (lms.ts ile aynı stil).
// Fiyat ve uygunluk kuralları saf modüllerdedir: program-pricing.ts, program-rules.ts.
import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { priceProgram, type ProgramQuoteCalc } from "@/lib/program-pricing";
import { courseProblems } from "@/lib/program-rules";

/** Havuz da, transaction bağlantısı da uyar. */
export type Queryable = Pick<PoolConnection, "query" | "execute">;

export type ProgramRow = {
  id: number;
  slug: string;
  code: string;
  title: string;
  description: string;
  category: string;
  thumbnail_url: string | null;
  price: number;
  is_published: boolean;
  sort_order: number;
};

export type ProgramCourse = {
  id: number;
  slug: string;
  title: string;
  hours: number;
  price: number;
  thumbnail_url: string | null;
  is_published: boolean;
  has_final_quiz: boolean;
  sort_order: number;
};

const PROGRAM_COLUMNS = `p.id, p.slug, p.code, p.title, p.description, p.category, p.thumbnail_url, p.price, p.is_published, p.sort_order`;

/** Final sınavı: module_id IS NULL bir quiz ve en az bir puanlanan (scenario olmayan) soru — lms.ts QUIZ_TOTAL_SQL ile tutarlı. */
const HAS_FINAL_QUIZ_SQL = `EXISTS (SELECT 1 FROM quizzes q WHERE q.course_id = c.id AND q.module_id IS NULL
    AND EXISTS (SELECT 1 FROM questions qu WHERE qu.quiz_id = q.id AND qu.type <> 'scenario'))`;

function mapProgram(r: RowDataPacket): ProgramRow {
  return {
    id: r.id,
    slug: r.slug,
    code: r.code,
    title: r.title,
    description: r.description,
    category: r.category,
    thumbnail_url: r.thumbnail_url,
    price: Number(r.price),
    is_published: !!r.is_published,
    sort_order: Number(r.sort_order),
  };
}

export async function getProgramBySlug(slug: string, opts: { includeDraft?: boolean } = {}): Promise<ProgramRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${PROGRAM_COLUMNS} FROM programs p WHERE p.slug = ? ${opts.includeDraft ? "" : "AND p.is_published = 1"} LIMIT 1`,
    [slug],
  );
  return rows[0] ? mapProgram(rows[0]) : null;
}

export async function getProgramById(id: number): Promise<ProgramRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT ${PROGRAM_COLUMNS} FROM programs p WHERE p.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapProgram(rows[0]) : null;
}

/** Yayındaki programlar; kurs sayısı, liste fiyatı toplamı (S) ve toplam saat programın TÜM kurslarından hesaplanır. */
export async function listPublishedPrograms(): Promise<(ProgramRow & { course_count: number; list_total: number; hours: number })[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${PROGRAM_COLUMNS},
            COUNT(c.id) AS course_count,
            COALESCE(SUM(c.price), 0) AS list_total,
            COALESCE(SUM(c.hours), 0) AS hours
       FROM programs p
       LEFT JOIN program_courses pc ON pc.program_id = p.id
       LEFT JOIN courses c ON c.id = pc.course_id
      WHERE p.is_published = 1
      GROUP BY p.id
      ORDER BY p.sort_order, p.id`,
  );
  return rows.map((r) => ({
    ...mapProgram(r),
    course_count: Number(r.course_count),
    list_total: Number(r.list_total),
    hours: Number(r.hours),
  }));
}

/** Programın TÜM kursları (yayın durumuna bakılmaksızın), program içi sıraya göre. */
export async function listProgramCourses(programId: number): Promise<ProgramCourse[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.slug, c.title, c.hours, c.price, c.thumbnail_url, c.is_published, pc.sort_order,
            ${HAS_FINAL_QUIZ_SQL} AS has_final_quiz
       FROM program_courses pc
       JOIN courses c ON c.id = pc.course_id
      WHERE pc.program_id = ?
      ORDER BY pc.sort_order, c.id`,
    [programId],
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    hours: Number(r.hours),
    price: Number(r.price),
    thumbnail_url: r.thumbnail_url,
    is_published: !!r.is_published,
    has_final_quiz: !!r.has_final_quiz,
    sort_order: Number(r.sort_order),
  }));
}

/** Edinilmiş kurslar: `source <> 'plus'` (Plus ile geçici açılanlar sayılmaz). */
export async function listOwnedCourseIds(userId: number): Promise<Set<number>> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT course_id FROM enrollments WHERE user_id = ? AND source <> 'plus'", [userId]);
  return new Set(rows.map((r) => Number(r.course_id)));
}

export async function isProgramMember(userId: number, programId: number): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT 1 FROM program_enrollments WHERE user_id = ? AND program_id = ? LIMIT 1", [userId, programId]);
  return rows.length > 0;
}

export type ProgramOffer = {
  program: ProgramRow;
  courses: ProgramCourse[];
  calc: ProgramQuoteCalc;
  sellable: boolean;
  problems: string[];
  member: boolean;
};

/** Program sayfası / sepet için tek teklif: fiyat DB'den, kişiye özel (giriş yoksa edinilmiş küme boş). */
export async function getProgramOffer(slug: string, userId: number | null, opts: { includeDraft?: boolean } = {}): Promise<ProgramOffer | null> {
  const program = await getProgramBySlug(slug, opts);
  if (!program) return null;
  const courses = await listProgramCourses(program.id);
  const [owned, member] = userId
    ? await Promise.all([listOwnedCourseIds(userId), isProgramMember(userId, program.id)])
    : [new Set<number>(), false];
  const calc = priceProgram(program.price, courses.map((c) => ({ id: c.id, price: c.price })), owned);
  const problems = courseProblems(courses);
  return { program, courses, calc, sellable: problems.length === 0, problems, member };
}

// ── Yazma ─────────────────────────────────────────────────────────────────────
/**
 * Kursa kalıcı erişim yazar: kayıt yoksa ekler, `source='plus'` ise verilen kaynağa yükseltir,
 * diğer kaynaklara (admin/purchase/gift) dokunmaz. `INSERT IGNORE` Plus kaydını yükseltmediği için ON DUPLICATE KEY kullanılır.
 */
export async function grantCourseEnrollment(conn: Queryable, userId: number, courseId: number, source: "purchase" | "gift"): Promise<void> {
  await conn.execute(
    `INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', ?)
     ON DUPLICATE KEY UPDATE source = IF(source = 'plus', ?, source)`,
    [userId, courseId, source, source],
  );
}

/**
 * Üyelik satırını `INSERT IGNORE` eder; yeni eklendiyse `true`, zaten üyeyse `false` döner.
 * `purchase`/`gift` kaynağında programdaki TÜM kurslara üyeliğin yeni olup olmadığına bakılmaksızın
 * `grantCourseEnrollment` uygulanır (ödenmiş bir yeniden işlem, eksik/Plus kayıtları tamamlar); `auto` kurs yazmaz.
 */
export async function enrollInProgram(conn: Queryable, userId: number, programId: number, source: "purchase" | "gift" | "auto"): Promise<boolean> {
  const [res] = await conn.execute<ResultSetHeader>(
    "INSERT IGNORE INTO program_enrollments (user_id, program_id, source) VALUES (?, ?, ?)",
    [userId, programId, source],
  );
  if (source !== "auto") {
    const [rows] = await conn.query<RowDataPacket[]>("SELECT course_id FROM program_courses WHERE program_id = ? ORDER BY course_id", [programId]);
    for (const r of rows) await grantCourseEnrollment(conn, userId, Number(r.course_id), source);
  }
  return res.affectedRows === 1;
}

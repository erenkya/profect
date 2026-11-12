// Uzmanlık Programı (kurs paketi) veri erişimi. Ham SQL — mysql2 havuzu (lms.ts ile aynı stil).
// Fiyat ve uygunluk kuralları saf modüllerdedir: program-pricing.ts, program-rules.ts.
import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import { courseLessonCountSql } from "@/lib/lms";
import { priceProgram, type ProgramQuoteCalc } from "@/lib/program-pricing";
import { courseProblems, generateProgramCertificateCode, isProgramComplete, type CourseEligibility } from "@/lib/program-rules";

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
  intro_video_key: string | null;
  price: number;
  is_published: boolean;
  sort_order: number;
};

export type ProgramCourse = {
  id: number;
  slug: string;
  title: string;
  lesson_count: number;
  price: number;
  thumbnail_url: string | null;
  is_published: boolean;
  has_final_quiz: boolean;
  sort_order: number;
};

const PROGRAM_COLUMNS = `p.id, p.slug, p.code, p.title, p.description, p.category, p.thumbnail_url, p.intro_video_key, p.price, p.is_published, p.sort_order`;

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
    intro_video_key: r.intro_video_key,
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

/** Yayındaki programlar; kurs sayısı, liste fiyatı toplamı (S) ve toplam süre programın TÜM kurslarından hesaplanır. */
export async function listPublishedPrograms(): Promise<(ProgramRow & { course_count: number; list_total: number; lesson_count: number })[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${PROGRAM_COLUMNS},
            COUNT(c.id) AS course_count,
            COALESCE(SUM(c.price), 0) AS list_total,
            COALESCE(SUM(${courseLessonCountSql("c")}), 0) AS lesson_count
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
    lesson_count: Number(r.lesson_count),
  }));
}

/** Programın TÜM kursları (yayın durumuna bakılmaksızın), program içi sıraya göre. */
export async function listProgramCourses(programId: number): Promise<ProgramCourse[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.slug, c.title, ${courseLessonCountSql("c")} AS lesson_count, c.price, c.thumbnail_url, c.is_published, pc.sort_order,
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
    lesson_count: Number(r.lesson_count),
    price: Number(r.price),
    thumbnail_url: r.thumbnail_url,
    is_published: !!r.is_published,
    has_final_quiz: !!r.has_final_quiz,
    sort_order: Number(r.sort_order),
  }));
}

/** Yönetim listesi: taslaklar dahil tüm programlar; `problem_courses` = yayında olmayan ya da final sınavı eksik kurs sayısı. */
export async function listAdminPrograms(): Promise<(ProgramRow & { course_count: number; list_total: number; problem_courses: number })[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${PROGRAM_COLUMNS},
            COUNT(c.id) AS course_count,
            COALESCE(SUM(c.price), 0) AS list_total,
            COALESCE(SUM(c.is_published = 0 OR NOT ${HAS_FINAL_QUIZ_SQL}), 0) AS problem_courses
       FROM programs p
       LEFT JOIN program_courses pc ON pc.program_id = p.id
       LEFT JOIN courses c ON c.id = pc.course_id
      GROUP BY p.id
      ORDER BY p.sort_order, p.id`,
  );
  return rows.map((r) => ({ ...mapProgram(r), course_count: Number(r.course_count), list_total: Number(r.list_total), problem_courses: Number(r.problem_courses) }));
}

/** Verilen kurs kimlikleri için uygunluk bilgisi (yönetim kaydı doğrulaması); sıra girdideki gibi, olmayan kimlikler atlanır. */
export async function getCourseEligibility(courseIds: readonly number[]): Promise<CourseEligibility[]> {
  if (courseIds.length === 0) return [];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.title, c.price, c.is_published, ${HAS_FINAL_QUIZ_SQL} AS has_final_quiz FROM courses c WHERE c.id IN (?)`,
    [courseIds],
  );
  const byId = new Map(rows.map((r) => [Number(r.id), { id: Number(r.id), title: r.title as string, price: Number(r.price), is_published: !!r.is_published, has_final_quiz: !!r.has_final_quiz }]));
  return courseIds.flatMap((id) => byId.get(id) ?? []);
}

/** Programın üye sayısı (program_enrollments). */
export async function countProgramMembers(programId: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM program_enrollments WHERE program_id = ?", [programId]);
  return Number(rows[0]?.n ?? 0);
}

/** Yönetim kurs seçicisi: yayındaki kurslar (final sınavı eksik olanlar da gelir; editör onları seçilemez gösterir). */
export async function listPublishedCourseOptions(): Promise<CourseEligibility[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.title, c.price, c.is_published, ${HAS_FINAL_QUIZ_SQL} AS has_final_quiz FROM courses c WHERE c.is_published = 1 ORDER BY c.title`,
  );
  return rows.map((r) => ({ id: Number(r.id), title: r.title as string, price: Number(r.price), is_published: true, has_final_quiz: !!r.has_final_quiz }));
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
export async function grantCourseEnrollment(conn: Queryable, userId: number, courseId: number, source: "purchase" | "gift" | "admin" | "company"): Promise<void> {
  await conn.execute(
    `INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', ?)
     ON DUPLICATE KEY UPDATE source = IF(source = 'plus', ?, source)`,
    [userId, courseId, source, source],
  );
}

/**
 * Üyelik satırını `INSERT IGNORE` eder; yeni eklendiyse `true`, zaten üyeyse `false` döner.
 * `purchase`/`gift`/`admin`/`company` kaynağında programdaki TÜM kurslara üyeliğin yeni olup olmadığına bakılmaksızın
 * `grantCourseEnrollment` uygulanır (ödenmiş bir yeniden işlem, eksik/Plus kayıtları tamamlar); `auto` kurs yazmaz.
 */
export async function enrollInProgram(conn: Queryable, userId: number, programId: number, source: "purchase" | "gift" | "auto" | "admin" | "company"): Promise<boolean> {
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

// ── Otomatik üyelik ve program sertifikası ───────────────────────────────────
/** Aday programlar (kapsam kuralları için `ensureProgramProgress`a bakın) ve her birinin TÜM kurs id'leri. */
async function candidatePrograms(userId: number, opts: { courseId?: number; programId?: number }): Promise<Map<number, number[]>> {
  let ids: number[];
  if (opts.programId != null) {
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM programs WHERE id = ?", [opts.programId]);
    ids = rows.map((r) => Number(r.id));
  } else if (opts.courseId != null) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.id FROM programs p JOIN program_courses pc ON pc.program_id = p.id AND pc.course_id = ?
        WHERE p.is_published = 1 OR EXISTS (SELECT 1 FROM program_enrollments pe WHERE pe.user_id = ? AND pe.program_id = p.id)`,
      [opts.courseId, userId],
    );
    ids = rows.map((r) => Number(r.id));
  } else {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT p.id FROM programs p
         JOIN program_courses pc ON pc.program_id = p.id
         JOIN certificates ce ON ce.course_id = pc.course_id AND ce.user_id = ?
        WHERE p.is_published = 1 OR EXISTS (SELECT 1 FROM program_enrollments pe WHERE pe.user_id = ? AND pe.program_id = p.id)`,
      [userId, userId],
    );
    ids = rows.map((r) => Number(r.id));
  }
  // Sertifikası zaten verilmiş programlar elenir: her ziyarette gereksiz yazma transaction'ı (kilit, auto-increment tüketimi) olmasın.
  if (ids.length > 0) {
    const [done] = await pool.query<RowDataPacket[]>("SELECT program_id FROM program_certificates WHERE user_id = ? AND program_id IN (?)", [userId, ids]);
    const certified = new Set(done.map((r) => Number(r.program_id)));
    ids = ids.filter((id) => !certified.has(id));
  }
  const out = new Map<number, number[]>();
  if (ids.length === 0) return out;
  const [courses] = await pool.query<RowDataPacket[]>(
    "SELECT program_id, course_id FROM program_courses WHERE program_id IN (?) ORDER BY program_id, sort_order, course_id",
    [ids],
  );
  for (const id of ids) out.set(id, []);
  for (const r of courses) out.get(Number(r.program_id))?.push(Number(r.course_id));
  return out;
}

/**
 * Tek bir (kullanıcı, program) için `auto` üyelik + program sertifikası yazar; tek transaction.
 * Eşzamanlı çağrılar `UNIQUE (user_id, program_id)` anahtarlarında seri hale gelir: üyelik `INSERT IGNORE`,
 * sertifika `INSERT IGNORE` (kod çakışmasında kod yeniden üretilir). Yeni verilen kodu ya da `null` döner.
 */
async function issueProgramCertificate(userId: number, programId: number): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await enrollInProgram(conn, userId, programId, "auto");
      let issued: string | null = null;
      for (let i = 0; i < 5 && !issued; i++) {
        const code = generateProgramCertificateCode();
        const [res] = await conn.execute<ResultSetHeader>(
          "INSERT IGNORE INTO program_certificates (user_id, program_id, certificate_code) VALUES (?, ?, ?)",
          [userId, programId, code],
        );
        if (res.affectedRows === 1) {
          issued = code;
          break;
        }
        // Eklenmedi: ya (kullanıcı, program) için sertifika zaten var (çift sertifika yok) ya da kod çakıştı.
        const [existing] = await conn.query<RowDataPacket[]>(
          "SELECT 1 FROM program_certificates WHERE user_id = ? AND program_id = ? LIMIT 1",
          [userId, programId],
        );
        if (existing.length > 0) break;
        if (i === 4) throw new Error("Program sertifika kodu üretilemedi.");
      }
      await conn.commit();
      return issued;
    } catch (err) {
      await conn.rollback().catch(() => {});
      if ((err as { code?: string }).code === "ER_LOCK_DEADLOCK" && attempt < 3) continue;
      throw err;
    } finally {
      conn.release();
    }
  }
}

/**
 * İdempotent ve eşzamanlılığa dayanıklı: kullanıcının bir programdaki TÜM kursların `certificates` satırı varsa
 * `program_enrollments`'a (`auto`, yoksa) ve `program_certificates`'a (yoksa) ekler. Yeni verilen kodları döner.
 *
 * Aday programlar: `programId` → o program (yayın durumuna bakılmaz); `courseId` → o kursu içeren programlardan yayında
 * olanlar ya da kullanıcının üye olduğu; ikisi de yoksa kullanıcının en az bir kursunun sertifikası olduğu programlardan yayında olanlar
 * ya da kullanıcının üye olduğu. Sertifikası zaten verilmiş programlar her modda elenir.
 * Kursu olmayan program asla tamamlanmaz. Daha önce verilmiş sertifika, kurs sonradan yayından kalksa da geçerli kalır.
 */
export async function ensureProgramProgress(userId: number, opts: { courseId?: number; programId?: number } = {}): Promise<{ issued: string[] }> {
  const candidates = await candidatePrograms(userId, opts);
  if (candidates.size === 0) return { issued: [] };
  const [certRows] = await pool.query<RowDataPacket[]>("SELECT course_id FROM certificates WHERE user_id = ?", [userId]);
  const certified = new Set(certRows.map((r) => Number(r.course_id)));
  const issued: string[] = [];
  for (const [programId, courseIds] of candidates) {
    if (!isProgramComplete(courseIds, certified)) continue;
    const code = await issueProgramCertificate(userId, programId);
    if (code) issued.push(code);
  }
  return { issued };
}

// ── Okuma: kurs sayfaları, program sayfası, Programlarım ─────────────────────
/** Kursu içeren yayındaki programlar ("Bu kurs X programının parçası" bağlantısı), program sırasıyla. */
export async function listProgramsForCourse(courseId: number): Promise<{ slug: string; title: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT p.slug, p.title FROM programs p JOIN program_courses pc ON pc.program_id = p.id AND pc.course_id = ?
      WHERE p.is_published = 1 ORDER BY p.sort_order, p.id`,
    [courseId],
  );
  return rows.map((r) => ({ slug: r.slug, title: r.title }));
}

/**
 * Kullanıcının verilen kurslardaki ilerlemesi (lms.ts `getCourseProgress` ile aynı ölçüt: (biten ders + geçilen sınav) / (ders + sınav))
 * ve kurs sertifikası, tek sorguda. lms.ts bu modülü içe aktardığı için ölçüt burada tekrarlanır (döngüsel içe aktarma olmasın).
 */
export async function getCourseStandings(userId: number, courseIds: number[]): Promise<Map<number, { percentage: number; certificate_code: string | null }>> {
  const out = new Map<number, { percentage: number; certificate_code: string | null }>();
  if (courseIds.length === 0) return out;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id,
            (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS total_lessons,
            (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
               JOIN modules m ON m.id = l.module_id WHERE lp.user_id = ? AND m.course_id = c.id) AS done_lessons,
            (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id
               AND EXISTS (SELECT 1 FROM questions qu WHERE qu.quiz_id = q.id AND qu.type <> 'scenario')) AS total_quizzes,
            (SELECT COUNT(DISTINCT qa.quiz_id) FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
               WHERE qa.user_id = ? AND q.course_id = c.id AND qa.is_passed = 1
                 AND EXISTS (SELECT 1 FROM questions qu WHERE qu.quiz_id = q.id AND qu.type <> 'scenario')) AS passed_quizzes,
            cert.certificate_code
       FROM courses c
       LEFT JOIN certificates cert ON cert.course_id = c.id AND cert.user_id = ?
      WHERE c.id IN (?)`,
    [userId, userId, userId, courseIds],
  );
  for (const r of rows) {
    const total = Number(r.total_lessons) + Number(r.total_quizzes);
    const done = Number(r.done_lessons) + Number(r.passed_quizzes);
    out.set(Number(r.id), { percentage: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0, certificate_code: r.certificate_code ?? null });
  }
  return out;
}

export type MyProgram = {
  program: ProgramRow;
  courses: { id: number; slug: string; title: string; percentage: number; certificate_code: string | null }[];
  /** Kurs sertifikası alınmış kurs sayısı ("tamamlandı" ölçütü). */
  completed: number;
  total: number;
  certificate_code: string | null;
};

/** Üye olunan programlar (yayından kalkmış olsa da), son katılım önce; kurs bazlı ilerleme ve program sertifikası ile. */
export async function listMyPrograms(userId: number): Promise<MyProgram[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${PROGRAM_COLUMNS}, pcert.certificate_code
       FROM program_enrollments pe
       JOIN programs p ON p.id = pe.program_id
       LEFT JOIN program_certificates pcert ON pcert.program_id = p.id AND pcert.user_id = pe.user_id
      WHERE pe.user_id = ?
      ORDER BY pe.enrolled_at DESC, pe.id DESC`,
    [userId],
  );
  const out: MyProgram[] = [];
  for (const r of rows) {
    const program = mapProgram(r);
    const courses = await listProgramCourses(program.id);
    const standings = await getCourseStandings(userId, courses.map((c) => c.id));
    const mapped = courses.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      percentage: standings.get(c.id)?.percentage ?? 0,
      certificate_code: standings.get(c.id)?.certificate_code ?? null,
    }));
    out.push({
      program,
      courses: mapped,
      completed: mapped.filter((c) => c.certificate_code).length,
      total: mapped.length,
      certificate_code: r.certificate_code ?? null,
    });
  }
  return out;
}

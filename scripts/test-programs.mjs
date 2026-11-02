import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
// Uzmanlık Programı için uçtan uca test (çalışan sunucu + gerçek DB). Kendi kullanıcılarını/kurslarını/programını oluşturur,
// sonunda hepsini siler (e-postalar @example.invalid, kurs/program slug'ları e2e-prog-*).
// Kullanım:  npm run dev   →   BASE_URL=http://localhost:3000 npm run test:programs
// Not: Görev 2'de yalnızca iskelet (seed + temizlik); senaryolar sonraki görevlerde eklenir.
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
const PW = "Gecici-Sifre-4821!";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };

const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306) });
const stamp = Date.now();
const PREFIX = `e2e-prog-${stamp}`;
const mail = (n) => `${PREFIX}-${n}@example.invalid`;
const PROGRAM_SLUG = PREFIX;
const COURSE_PRICE = 1000;
const PROGRAM_PRICE = 4000;
const COURSE_COUNT = 5;

async function api(path, { method = "POST", body, cookie = "" } = {}) {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let json = null; try { json = await res.json(); } catch {}
  const auth = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("profect_auth_token="))?.split(";")[0] ?? "";
  return { status: res.status, json, auth };
}
const page = async (path, cookie = "") => { const res = await fetch(B + path, { headers: { cookie }, redirect: "manual" }); return { status: res.status, location: res.headers.get("location") ?? "", text: res.status === 200 ? await res.text() : "", headers: res.headers }; };
const addUser = async (email, { role = "user", verified = 1, pw = PW } = {}) => {
  const [r] = await db.query("INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at, kvkk_consent_at) VALUES (?, ?, ?, ?, ?, IF(?=1, NOW(), NULL), NOW())", ["E2E " + email.split("-").pop().split("@")[0], email, await bcrypt.hash(pw, 10), role, verified, verified]);
  return r.insertId;
};
const login = async (email, pw = PW) => (await api("/api/auth/login", { body: { email, password: pw, turnstileToken: T } }));
const cookieFor = async (email, pw = PW) => { const r = await login(email, pw); if (!r.auth) throw new Error(`giriş başarısız ${email}: ${r.status} ${JSON.stringify(r.json)}`); return r.auth; };
const enrolled = async (userId, courseId) => (await db.query("SELECT source FROM enrollments WHERE user_id=? AND course_id=?", [userId, courseId]))[0][0];
const programMember = async (userId, programId) => (await db.query("SELECT source FROM program_enrollments WHERE user_id=? AND program_id=?", [userId, programId]))[0][0];

let programId;
const courseIds = [];
try {
  for (const t of ["programs", "program_courses", "program_enrollments", "program_certificates"]) {
    const [[tbl]] = await db.query("SHOW TABLES LIKE ?", [t]);
    if (!tbl) throw new Error(`${t} tablosu yok: önce npm run db:migrate`);
  }

  // — Hazırlık: 5 kurs (her birinde module_id NULL final sınavı + 1 soru), 1 program (B=4000), kullanıcılar
  for (let i = 1; i <= COURSE_COUNT; i++) {
    const [c] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', ?, 1)", [`${PREFIX}-c${i}`, `E2EP-${stamp}-${i}`.slice(0, 30), `E2E Program Kursu ${i}`, COURSE_PRICE]);
    courseIds.push(c.insertId);
    const [q] = await db.query("INSERT INTO quizzes (course_id, module_id, title, passing_score_percentage, mode) VALUES (?, NULL, ?, 70, 'fixed')", [c.insertId, `E2E Final ${i}`]);
    const [qu] = await db.query("INSERT INTO questions (quiz_id, type, question_text, position) VALUES (?, 'single', 'E2E soru', 1)", [q.insertId]);
    await db.query("INSERT INTO options (question_id, option_text, is_correct) VALUES (?, 'Doğru', 1), (?, 'Yanlış', 0)", [qu.insertId, qu.insertId]);
  }
  const [p] = await db.query("INSERT INTO programs (slug, code, title, description, price, is_published) VALUES (?, ?, 'E2E Uzmanlık Programı', 'e2e', ?, 1)", [PROGRAM_SLUG, `PRG-E2E-${stamp}`.slice(0, 30), PROGRAM_PRICE]);
  programId = p.insertId;
  for (const [i, cid] of courseIds.entries()) await db.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES (?, ?, ?)", [programId, cid, i]);

  const U1 = mail("buyer"), U2 = mail("other"), ADM = mail("admin");
  const u1 = await addUser(U1), u2 = await addUser(U2);
  await addUser(ADM, { role: "admin" });

  // — Seed doğrulaması
  const [[agg]] = await db.query(
    `SELECT COUNT(*) n, SUM(c.price) s,
            SUM(EXISTS (SELECT 1 FROM quizzes q WHERE q.course_id = c.id AND q.module_id IS NULL
                AND EXISTS (SELECT 1 FROM questions qu WHERE qu.quiz_id = q.id AND qu.type <> 'scenario'))) AS with_final
       FROM program_courses pc JOIN courses c ON c.id = pc.course_id WHERE pc.program_id = ?`, [programId]);
  const [[prog]] = await db.query("SELECT price, is_published FROM programs WHERE id = ?", [programId]);
  check("seed ok: 5 kurs × 1000, hepsinde soru içeren final sınavı, program B=4000 yayında",
    Number(agg.n) === COURSE_COUNT && Number(agg.s) === COURSE_COUNT * COURSE_PRICE && Number(agg.with_final) === COURSE_COUNT && Number(prog.price) === PROGRAM_PRICE && prog.is_published === 1,
    JSON.stringify({ agg, prog }));
  check("seed ok: kullanıcılar eklendi, henüz kayıt/üyelik yok", !!u1 && !!u2 && !(await enrolled(u1, courseIds[0])) && !(await programMember(u1, programId)));

  // — Sunucu erişilebilir ve test kullanıcıları giriş yapabiliyor
  const home = await page("/");
  check("sunucu yanıt veriyor (GET / 200)", home.status === 200, String(home.status));
  const ck = await cookieFor(U1);
  check("test kullanıcısı giriş yaptı", ck.startsWith("profect_auth_token="));
} catch (e) {
  failN++;
  console.log("✗ FAIL beklenmeyen hata:", e);
} finally {
  await db.query("DELETE FROM users WHERE email LIKE ?", [`${PREFIX}-%@example.invalid`]); // siparişler/üyelikler/sertifikalar/kayıtlar cascade
  if (programId) await db.query("DELETE FROM programs WHERE id = ?", [programId]); // program_courses cascade (kurs silinmeden önce)
  await db.query("DELETE FROM courses WHERE slug LIKE ?", [`${PREFIX}-c%`]); // quizzes/questions/options cascade
  const [[left]] = await db.query(
    "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c, (SELECT COUNT(*) FROM programs WHERE slug = ?) p",
    [`${PREFIX}-%`, `${PREFIX}-c%`, PROGRAM_SLUG]);
  console.log(`temizlik: kalan test kullanıcısı=${left.u}, kalan test kursu=${left.c}, kalan test programı=${left.p}`);
  if (left.u || left.c || left.p) failN++;
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

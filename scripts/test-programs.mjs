import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
// Uzmanlık Programı için uçtan uca test (çalışan sunucu + gerçek DB). Kendi kullanıcılarını/kurslarını/programını oluşturur,
// sonunda hepsini siler (e-postalar @example.invalid, kurs/program slug'ları e2e-prog-*).
// Kullanım:  npm run dev   →   BASE_URL=http://localhost:3000 npm run test:programs
// Senaryolar görev görev eklenir: (Görev 3) sepet teklifi /api/cart/quote.
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
const PROGRAM2_SLUG = `${PREFIX}-p2`;
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

let programId, program2Id;
const courseIds = [];
try {
  for (const t of ["programs", "program_courses", "program_enrollments", "program_certificates"]) {
    const [[tbl]] = await db.query("SHOW TABLES LIKE ?", [t]);
    if (!tbl) throw new Error(`${t} tablosu yok: önce npm run db:migrate`);
  }

  // — Hazırlık: 5 kurs (her birinde module_id NULL final sınavı + 1 soru), 1 program (B=4000), kullanıcılar
  const mkCourse = async (i) => {
    const [c] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', ?, 1)", [`${PREFIX}-c${i}`, `E2EP-${stamp}-${i}`.slice(0, 30), `E2E Program Kursu ${i}`, COURSE_PRICE]);
    const [q] = await db.query("INSERT INTO quizzes (course_id, module_id, title, passing_score_percentage, mode) VALUES (?, NULL, ?, 70, 'fixed')", [c.insertId, `E2E Final ${i}`]);
    const [qu] = await db.query("INSERT INTO questions (quiz_id, type, question_text, position) VALUES (?, 'single', 'E2E soru', 1)", [q.insertId]);
    await db.query("INSERT INTO options (question_id, option_text, is_correct) VALUES (?, 'Doğru', 1), (?, 'Yanlış', 0)", [qu.insertId, qu.insertId]);
    return c.insertId;
  };
  for (let i = 1; i <= COURSE_COUNT; i++) courseIds.push(await mkCourse(i));
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

  // ── Görev 3: sepet ve kişiye özel teklif (/api/cart/quote) ──
  const quote = async (items, cookie = "") => (await api("/api/cart/quote", { body: { items }, cookie })).json;
  const line = (q, key) => q?.lines?.find((l) => l.key === key);
  const PK = `program:${PROGRAM_SLUG}`;
  const P = { type: "program", slug: PROGRAM_SLUG };
  const own = async (userId, ids, source = "purchase") => { for (const id of ids) await db.query("INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', ?)", [userId, id, source]); };
  const mkUser = async (n) => { const e = mail(n); const id = await addUser(e); return { id, cookie: await cookieFor(e) }; };

  // İkinci program (ortak kurs c5 + yeni kurs c6): B=1600, S=2000 → r=0.8
  courseIds.push(await mkCourse(COURSE_COUNT + 1));
  const [p2] = await db.query("INSERT INTO programs (slug, code, title, description, price, is_published) VALUES (?, ?, 'E2E İkinci Program', 'e2e', 1600, 1)", [PROGRAM2_SLUG, `PRG-E2E2-${stamp}`.slice(0, 30)]);
  program2Id = p2.insertId;
  await db.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES (?, ?, 0), (?, ?, 1)", [program2Id, courseIds[4], program2Id, courseIds[5]]);
  const P2 = { type: "program", slug: PROGRAM2_SLUG };
  const P2K = `program:${PROGRAM2_SLUG}`;

  // girişsiz
  const g = await quote([P]);
  const gl = line(g, PK);
  check("girişsiz: program satırı ok, price 4000, oldPrice 4000", gl?.status === "ok" && gl.price === 4000 && gl.oldPrice === 4000 && gl.programId === programId && gl.courseId === null, JSON.stringify(gl));
  check("girişsiz: 5 çocuk, hiçbiri owned değil, indirimli fiyat 800", gl?.children?.length === 5 && gl.children.every((c) => !c.owned && c.price === 800 && c.listPrice === 1000), JSON.stringify(gl?.children));
  check("girişsiz: toplam 4000", g?.total === 4000, String(g?.total));

  // 3 kurs satın alınmış
  const a = await mkUser("own3");
  await own(a.id, courseIds.slice(0, 3));
  const aq = await quote([P], a.cookie);
  const al = line(aq, PK);
  check("3 kurs edinilmiş: price 1600, oldPrice 4000", al?.status === "ok" && al.price === 1600 && al.oldPrice === 4000, JSON.stringify(al));
  check("3 kurs edinilmiş: 5 çocuk, 3'ü owned (ilk üçü)", al?.children?.length === 5 && al.children.filter((c) => c.owned).length === 3 && al.children.slice(0, 3).every((c) => c.owned), JSON.stringify(al?.children));
  check("3 kurs edinilmiş: toplam 1600", aq?.total === 1600, String(aq?.total));

  // aynı sepette programın üyesi kurs → covered
  const slug = (i) => `${PREFIX}-c${i}`;
  const cv = await quote([P, { type: "course", slug: slug(1) }]);
  const cvl = line(cv, `course:${slug(1)}`);
  check("sepette program + üyesi kurs: kurs satırı covered, toplam değişmez (4000)", cvl?.status === "covered" && cv.total === 4000, JSON.stringify({ cvl, total: cv?.total }));
  const cvOrder = await quote([{ type: "course", slug: slug(1) }, P]);
  check("sıra önemsiz: kurs önce gelse de covered, toplam 4000", line(cvOrder, `course:${slug(1)}`)?.status === "covered" && cvOrder.total === 4000, JSON.stringify(cvOrder?.lines?.map((l) => [l.key, l.status])));
  const nocv = await quote([{ type: "course", slug: slug(1) }]);
  check("program olmadan kurs satırı ok (1000)", line(nocv, `course:${slug(1)}`)?.status === "ok" && nocv.total === 1000);

  // iki program ortak kurs: ikinci program birincinin kursunu edinilmiş sayar
  const two = await quote([P, P2]);
  const t2 = line(two, P2K);
  check("iki program (ortak kurs): ikinci program price 800, c5 owned", t2?.status === "ok" && t2.price === 800 && t2.children?.[0]?.owned === true && t2.children?.[1]?.owned === false, JSON.stringify(t2));
  check("iki program: toplam 4800", two?.total === 4800, String(two?.total));
  const twoRev = await quote([P2, P]);
  check("iki program ters sıra: önce P2 1600, sonra P 3200 (sepet sırasıyla)", line(twoRev, P2K)?.price === 1600 && line(twoRev, PK)?.price === 3200 && twoRev.total === 4800, JSON.stringify(twoRev?.lines?.map((l) => [l.key, l.price])));

  // tüm kurslar edinilmiş, üye değil → join
  const j = await mkUser("owns5");
  await own(j.id, courseIds.slice(0, 5));
  const jq = await quote([P], j.cookie);
  const jl = line(jq, PK);
  check("5 kurs edinilmiş, üye değil: status join, price 0, toplam dışında", jl?.status === "join" && jl.price === 0 && jq.total === 0, JSON.stringify({ jl, total: jq?.total }));
  const jc = await quote([P, { type: "course", slug: slug(1) }], j.cookie);
  check("join iken kurs satırı covered değil (owned)", line(jc, `course:${slug(1)}`)?.status === "owned", JSON.stringify(jc?.lines?.map((l) => [l.key, l.status])));

  // program üyesi
  await db.query("INSERT INTO program_enrollments (user_id, program_id, source) VALUES (?, ?, 'purchase')", [j.id, programId]);
  const mq = await quote([P], j.cookie);
  check("program üyesi: status owned, price 0", line(mq, PK)?.status === "owned" && line(mq, PK).price === 0 && mq.total === 0, JSON.stringify(line(mq, PK)));

  // Plus kaynaklı kayıtlar kredi vermez
  const pl = await mkUser("plus");
  await own(pl.id, courseIds.slice(0, 3), "plus");
  await db.query("UPDATE users SET plus_until = DATE_ADD(NOW(), INTERVAL 20 DAY) WHERE id = ?", [pl.id]);
  const plq = await quote([P], pl.cookie);
  const pll = line(plq, PK);
  check("3 kurs source=plus + aktif Plus: kredi yok, price 4000, owned çocuk yok", pll?.status === "ok" && pll.price === 4000 && pll.children?.every((c) => !c.owned), JSON.stringify(pll));
  const plc = await quote([{ type: "course", slug: slug(1) }], pl.cookie);
  check("Plus'lı kullanıcıda kurs satırı hâlâ owned (mevcut davranış)", line(plc, `course:${slug(1)}`)?.status === "owned");

  // yayından kalkan kurs → program unavailable; geri alınınca ok
  await db.query("UPDATE courses SET is_published = 0 WHERE id = ?", [courseIds[2]]);
  const un = await quote([P]);
  const unl = line(un, PK);
  check("kurs yayından kalktı: program unavailable, price 0, toplam 0", unl?.status === "unavailable" && unl.price === 0 && un.total === 0, JSON.stringify(unl));
  const unc = await quote([P, { type: "course", slug: slug(1) }]);
  check("program unavailable iken kurs satırı covered değil (ok)", line(unc, `course:${slug(1)}`)?.status === "ok" && unc.total === 1000, JSON.stringify(unc?.lines?.map((l) => [l.key, l.status])));
  await db.query("UPDATE courses SET is_published = 1 WHERE id = ?", [courseIds[2]]);
  check("kurs geri yayınlandı: program tekrar ok (4000)", line(await quote([P]), PK)?.status === "ok");

  // yayında olmayan / olmayan program
  await db.query("UPDATE programs SET is_published = 0 WHERE id = ?", [programId]);
  check("program yayından kalktı: unavailable", line(await quote([P]), PK)?.status === "unavailable");
  await db.query("UPDATE programs SET is_published = 1 WHERE id = ?", [programId]);
  const miss = await quote([{ type: "program", slug: `${PREFIX}-yok` }]);
  check("olmayan program: unavailable", miss?.lines?.[0]?.status === "unavailable" && miss.total === 0, JSON.stringify(miss?.lines?.[0]));

  // sunucu yalnızca slug'a güvenir; istemcinin gönderdiği fiyat yok sayılır
  const forged = await api("/api/cart/quote", { body: { items: [{ type: "program", slug: PROGRAM_SLUG, price: 1 }] } });
  check("sahte price alanı yok sayılır (4000)", forged.json?.total === 4000, JSON.stringify(forged.json?.total));
  const bad = await api("/api/cart/quote", { body: { items: [{ type: "program" }] } });
  check("slug'sız program kalemi 400", bad.status === 400, String(bad.status));

  // checkout henüz program satırını işlemez (Görev 5) ama çökmez
  const co = await api("/api/checkout", { cookie: a.cookie, body: { items: [P], billing: { invoice_type: "bireysel", full_name: "E2E Alıcı", email: mail("own3") }, consents: { distance_sales: true, privacy: true, delivery_return: true, kvkk: true } } });
  check("checkout program satırında 409 (Görev 5'e kadar), sipariş yazılmaz", co.status === 409 && !(await db.query("SELECT 1 FROM orders WHERE user_id = ?", [a.id]))[0].length, `${co.status} ${JSON.stringify(co.json)}`);

  // ── Görev 4: üyelik (auto) ve program sertifikası ──
  const PROGRAM_TITLE = "E2E Uzmanlık Programı";
  const passQuiz = async (userId, cid) => {
    const [[q]] = await db.query("SELECT id FROM quizzes WHERE course_id = ? AND module_id IS NULL", [cid]);
    await db.query("INSERT INTO quiz_attempts (user_id, quiz_id, score, is_passed) VALUES (?, ?, 90, 1)", [userId, q.id]);
  };
  const gen = (cookie, cid) => api("/api/client/certificates/generate", { cookie, body: { course_id: cid } });
  const progCerts = async (userId, pid = programId) => (await db.query("SELECT certificate_code FROM program_certificates WHERE user_id = ? AND program_id = ?", [userId, pid]))[0];
  const progMembers = async (userId, pid = programId) => (await db.query("SELECT source FROM program_enrollments WHERE user_id = ? AND program_id = ?", [userId, pid]))[0];
  const first5 = courseIds.slice(0, COURSE_COUNT);

  // Satın almış kullanıcı: 4 kurs → program yok; 5. → tam 1 sertifika + 1 auto üyelik
  const g4 = await mkUser("cert-buyer");
  await own(g4.id, first5);
  for (const cid of first5) await passQuiz(g4.id, cid);
  for (const cid of first5.slice(0, 4)) {
    const r = await gen(g4.cookie, cid);
    check(`4 kursun sertifikası alınır (kurs ${cid}): 200, program_certificate_codes boş`, r.status === 200 && !!r.json?.certificate_code && Array.isArray(r.json?.program_certificate_codes) && r.json.program_certificate_codes.length === 0, JSON.stringify(r));
  }
  check("4 sertifika: program_certificates satırı yok, üyelik yok", (await progCerts(g4.id)).length === 0 && (await progMembers(g4.id)).length === 0);
  const last = await gen(g4.cookie, first5[4]);
  const codes = last.json?.program_certificate_codes;
  check("5. sertifika: yanıtta tam 1 program kodu (PRP-...)", last.status === 200 && Array.isArray(codes) && codes.length === 1 && /^PRP-\d{4}-\d{6}$/.test(codes[0]), JSON.stringify(last));
  const pc1 = await progCerts(g4.id), pm1 = await progMembers(g4.id);
  check("5. sertifika: tam 1 program_certificates ve 1 program_enrollments (auto)", pc1.length === 1 && pm1.length === 1 && pm1[0].source === "auto" && pc1[0].certificate_code === codes?.[0], JSON.stringify({ pc1, pm1 }));
  const PCODE = pc1[0]?.certificate_code;
  check("ikinci program (c6 sertifikasız) için sertifika yok", (await progCerts(g4.id, program2Id)).length === 0);
  const again = await gen(g4.cookie, first5[4]);
  check("aynı istek tekrar: 200, yeni program kodu yok, hâlâ 1 satır",
    again.status === 200 && Array.isArray(again.json?.program_certificate_codes) && again.json.program_certificate_codes.length === 0 && (await progCerts(g4.id)).length === 1 && (await progMembers(g4.id)).length === 1, JSON.stringify(again));
  check("üyelik 'auto' kurs kaydı yazmaz: kurs kayıtları purchase kalır", (await enrolled(g4.id, first5[0]))?.source === "purchase");

  // Eşzamanlılık: 4 sertifika hazır, 5.'yi iki kez paralel iste
  const cc = await mkUser("cert-race");
  await own(cc.id, first5);
  for (const cid of first5) await passQuiz(cc.id, cid);
  for (const cid of first5.slice(0, 4)) await gen(cc.cookie, cid);
  const [ra, rb] = await Promise.all([gen(cc.cookie, first5[4]), gen(cc.cookie, first5[4])]);
  check("eşzamanlı 2 istek: ikisi de 2xx", ra.status >= 200 && ra.status < 300 && rb.status >= 200 && rb.status < 300, JSON.stringify([ra.status, rb.status, ra.json, rb.json]));
  check("eşzamanlı 2 istek: tam 1 program sertifikası ve 1 üyelik", (await progCerts(cc.id)).length === 1 && (await progMembers(cc.id)).length === 1);
  // daha ağır deneme: 6 paralel istek
  const cc2 = await mkUser("cert-race6");
  await own(cc2.id, first5);
  for (const cid of first5) await passQuiz(cc2.id, cid);
  for (const cid of first5.slice(0, 4)) await gen(cc2.cookie, cid);
  const many = await Promise.all(Array.from({ length: 6 }, () => gen(cc2.cookie, first5[4])));
  const issuedCodes = many.flatMap((r) => r.json?.program_certificate_codes ?? []);
  check("eşzamanlı 6 istek: hepsi 2xx, tam 1 sertifika, 1 üyelik, yanıtlarda toplam 1 yeni kod",
    many.every((r) => r.status === 200) && (await progCerts(cc2.id)).length === 1 && (await progMembers(cc2.id)).length === 1 && issuedCodes.length === 1, JSON.stringify(many.map((r) => [r.status, r.json?.program_certificate_codes])));

  // Plus: kaydı yok, final sınavları SQL ile geçildi → generate tembel plus kaydı yazar, program sertifikası verilir
  const px = await mkUser("cert-plus");
  await db.query("UPDATE users SET plus_until = DATE_ADD(NOW(), INTERVAL 20 DAY) WHERE id = ?", [px.id]);
  for (const cid of first5) await passQuiz(px.id, cid);
  let plusLast;
  for (const cid of first5) plusLast = await gen(px.cookie, cid);
  check("Plus: 5 kurs sertifikası sonrası program sertifikası verildi (auto üyelik)", plusLast?.status === 200 && plusLast.json?.program_certificate_codes?.length === 1 && (await progCerts(px.id)).length === 1 && (await progMembers(px.id))[0]?.source === "auto", JSON.stringify(plusLast?.json));

  // Yayında olmayan program: üye değilse çağrıdan sertifika üretilmez; yayına alınınca üretilir
  const dr = await mkUser("cert-draft");
  await own(dr.id, first5);
  for (const cid of first5) await passQuiz(dr.id, cid);
  await db.query("UPDATE programs SET is_published = 0 WHERE id = ?", [programId]);
  let drLast;
  for (const cid of first5) drLast = await gen(dr.cookie, cid);
  check("yayında olmayan program, üye değil: sertifika/üyelik yok", drLast?.status === 200 && drLast.json?.program_certificate_codes?.length === 0 && (await progCerts(dr.id)).length === 0 && (await progMembers(dr.id)).length === 0, JSON.stringify(drLast?.json));
  await db.query("UPDATE programs SET is_published = 1 WHERE id = ?", [programId]);
  const drAgain = await gen(dr.cookie, first5[0]);
  check("program yayına alınınca bir sonraki çağrıda sertifika verilir", drAgain.json?.program_certificate_codes?.length === 1 && (await progCerts(dr.id)).length === 1, JSON.stringify(drAgain.json));

  // Okuma: sayfa, PDF, JSON, hesabım listesi
  const cpage = await page(`/sertifika/${PCODE}`);
  check("GET /sertifika/<program kodu> 200 ve program adını içerir", cpage.status === 200 && cpage.text.includes(PROGRAM_TITLE), String(cpage.status));
  check("sertifika sayfası dahil edilen kursları listeler ve final puanı iddia etmez", first5.every((_, i) => cpage.text.includes(`E2E Program Kursu ${i + 1}`)) && !cpage.text.includes("final sınavını"));
  const ppdf = await fetch(`${B}/api/public/certificates/${PCODE}/pdf`);
  const pdfBytes = Buffer.from(await ppdf.arrayBuffer());
  check("program PDF: 200, application/pdf, %PDF ile başlar", ppdf.status === 200 && (ppdf.headers.get("content-type") ?? "").includes("application/pdf") && pdfBytes.subarray(0, 4).toString() === "%PDF", `${ppdf.status} ${ppdf.headers.get("content-type")}`);
  const pj = await api(`/api/public/certificates/${PCODE}`, { method: "GET" });
  check("program JSON: data.course_title program adı, kind=program", pj.status === 200 && pj.json?.data?.course_title === PROGRAM_TITLE && pj.json.data.kind === "program", JSON.stringify(pj.json));
  const OLD_KEYS = ["certificate_code", "course_minutes", "course_title", "issued_at", "kind", "score", "student_name"];
  check("program JSON yalnızca eski alanlar + kind (sızıntı yok), score null", JSON.stringify(Object.keys(pj.json?.data ?? {}).sort()) === JSON.stringify(OLD_KEYS) && pj.json.data.score === null && pj.json.data.course_minutes >= 0, JSON.stringify(pj.json?.data));
  const [[cc1]] = await db.query("SELECT certificate_code FROM certificates WHERE user_id = ? AND course_id = ?", [g4.id, first5[0]]);
  const cj = await api(`/api/public/certificates/${cc1.certificate_code}`, { method: "GET" });
  check("kurs sertifikası JSON: aynı alanlar, kind=course, score dolu", cj.status === 200 && JSON.stringify(Object.keys(cj.json?.data ?? {}).sort()) === JSON.stringify(OLD_KEYS) && cj.json.data.kind === "course" && cj.json.data.course_title === "E2E Program Kursu 1" && cj.json.data.score === 90, JSON.stringify(cj.json?.data));
  const cpdf = await fetch(`${B}/api/public/certificates/${cc1.certificate_code}/pdf`);
  check("kurs PDF'i hâlâ çalışır (%PDF)", cpdf.status === 200 && Buffer.from(await cpdf.arrayBuffer()).subarray(0, 4).toString() === "%PDF");
  const cpage2 = await page(`/sertifika/${cc1.certificate_code}`);
  check("kurs sertifika sayfası: kurs adı ve %90 puan görünür", cpage2.status === 200 && cpage2.text.includes("E2E Program Kursu 1") && /%(<!-- -->)?90/.test(cpage2.text));
  const mine = await page("/hesabim/sertifikalarim", g4.cookie);
  check("/hesabim/sertifikalarim program kodunu ve kurs kodlarını içerir", mine.status === 200 && mine.text.includes(PCODE) && mine.text.includes(cc1.certificate_code), String(mine.status));

  // Satıştan kalkma: verilmiş sertifika/üyelik kalır, ikinci sertifika üretilmez
  await db.query("UPDATE courses SET is_published = 0 WHERE id = ?", [first5[2]]);
  const afterUnpub = await page(`/sertifika/${PCODE}`);
  const genUnpub = await gen(g4.cookie, first5[0]);
  const pdfUnpub = await fetch(`${B}/api/public/certificates/${PCODE}/pdf`);
  check("kurs yayından kalktı: program sertifika sayfası 200, PDF 200", afterUnpub.status === 200 && pdfUnpub.status === 200);
  check("kurs yayından kalktı: üyelik duruyor, ikinci sertifika üretilmedi", (await progMembers(g4.id)).length === 1 && (await progCerts(g4.id)).length === 1 && genUnpub.json?.program_certificate_codes?.length === 0, JSON.stringify(genUnpub.json));
  await db.query("UPDATE courses SET is_published = 1 WHERE id = ?", [first5[2]]);
  check("kurs geri yayına alındı", (await db.query("SELECT is_published FROM courses WHERE id = ?", [first5[2]]))[0][0].is_published === 1);
} catch (e) {
  failN++;
  console.log("✗ FAIL beklenmeyen hata:", e);
} finally {
  await db.query("DELETE FROM users WHERE email LIKE ?", [`${PREFIX}-%@example.invalid`]); // siparişler/üyelikler/sertifikalar/kayıtlar cascade
  await db.query("DELETE FROM programs WHERE slug LIKE ?", [`${PREFIX}%`]); // program_courses cascade (kurs silinmeden önce)
  await db.query("DELETE FROM courses WHERE slug LIKE ?", [`${PREFIX}-c%`]); // quizzes/questions/options cascade
  const [[left]] = await db.query(
    "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c, (SELECT COUNT(*) FROM programs WHERE slug LIKE ?) p",
    [`${PREFIX}-%`, `${PREFIX}-c%`, `${PREFIX}%`]);
  console.log(`temizlik: kalan test kullanıcısı=${left.u}, kalan test kursu=${left.c}, kalan test programı=${left.p}`);
  if (left.u || left.c || left.p) failN++;
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

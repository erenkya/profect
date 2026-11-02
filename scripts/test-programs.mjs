import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
// Uzmanlık Programı için uçtan uca test (çalışan sunucu + gerçek DB). Kendi kullanıcılarını/kurslarını/programını oluşturur,
// sonunda hepsini siler (e-postalar @example.invalid, kurs/program slug'ları e2e-prog-*).
// Kullanım:  npm run dev   →   BASE_URL=http://localhost:3000 npm run test:programs
// Senaryolar görev görev eklenir: (Görev 3) sepet teklifi /api/cart/quote, (Görev 4) sertifika, (Görev 5) satın alma/teslim/ücretsiz katılım.
// Ödeme sağlayıcısı manual ise sipariş admin onayıyla, mock ise anında tamamlanır (ikisi de desteklenir).
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
const PROGRAM_TITLE_P = "E2E Uzmanlık Programı";
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
  const mkCourse = async (i, price = COURSE_PRICE) => {
    const [c] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', ?, 1)", [`${PREFIX}-c${i}`, `E2EP-${stamp}-${i}`.slice(0, 30), `E2E Program Kursu ${i}`, price]);
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

  // ── Görev 5: satın alma, teslim ve ücretsiz katılım ──
  const BILLING = (email) => ({ invoice_type: "bireysel", full_name: "E2E Alıcı", email });
  const CONSENTS = { distance_sales: true, privacy: true, delivery_return: true, kvkk: true };
  const admCookie = await cookieFor(ADM);
  const checkout = (user, extra = {}, items = [P]) => api("/api/checkout", { cookie: user.cookie, body: { items, billing: BILLING(user.email), consents: CONSENTS, ...extra } });
  /** Sağlayıcı manual ise (pending) admin onaylar; mock ise zaten paid. */
  const settle = async (r) => {
    if (r.json?.status === "pending") return api(`/api/admin/orders/${r.json.orderId}`, { method: "PATCH", cookie: admCookie, body: { action: "approve" } });
    return null;
  };
  const orderOf = async (orderId) => (await db.query("SELECT amount, status, provider FROM orders WHERE id = ?", [orderId]))[0][0];
  const itemsOf = async (orderId) => (await db.query("SELECT item_type, course_id, program_id, title, unit_price FROM order_items WHERE order_id = ?", [orderId]))[0];
  const enrollCount = async (userId) => Number((await db.query("SELECT COUNT(*) n FROM enrollments WHERE user_id = ?", [userId]))[0][0].n);
  const sources = async (userId, ids) => Promise.all(ids.map(async (id) => (await enrolled(userId, id))?.source ?? null));
  const waitFor = async (fn, ms = 8000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)); } return await fn(); };
  const mkBuyer = async (n) => { const e = mail(n); const id = await addUser(e); return { id, email: e, cookie: await cookieFor(e) }; };

  // 3/5 edinilmiş → 1600; sipariş kalemi program; ödeme sonrası 5 kurs + üyelik
  const b1 = await mkBuyer("buy3");
  await own(b1.id, courseIds.slice(0, 3));
  const r1 = await checkout(b1);
  check("3/5 edinilmiş: checkout 201", r1.status === 201 && !!r1.json?.orderId, JSON.stringify(r1));
  const o1 = r1.json?.orderId;
  const it1 = await itemsOf(o1);
  check("sipariş tutarı 1600, tek kalem: item_type program, program_id dolu, title, unit_price 1600",
    Number((await orderOf(o1)).amount) === 1600 && it1.length === 1 && it1[0].item_type === "program" && it1[0].program_id === programId && it1[0].course_id === null && it1[0].title === PROGRAM_TITLE_P && Number(it1[0].unit_price) === 1600,
    JSON.stringify({ o: await orderOf(o1), it1 }));
  if (r1.json?.status === "pending") check("manual: onaydan önce yeni kurs/üyelik yok", (await enrollCount(b1.id)) === 3 && !(await programMember(b1.id, programId)));
  const a1 = await settle(r1);
  check("sipariş ödendi", (await orderOf(o1)).status === "paid" && (a1 === null || a1.status === 200), JSON.stringify(a1));
  const src1 = await sources(b1.id, courseIds.slice(0, 5));
  check("ödeme sonrası 5 kursun tamamında enrollments; hepsi purchase (yeni 2 dahil)", (await enrollCount(b1.id)) === 5 && src1.every((x) => x === "purchase"), JSON.stringify(src1));
  check("program_enrollments.source purchase", (await programMember(b1.id, programId))?.source === "purchase");
  const a1b = await api(`/api/admin/orders/${o1}`, { method: "PATCH", cookie: admCookie, body: { action: "approve" } });
  check("aynı siparişi tekrar onayla: 200, kayıt/üyelik sayısı değişmez (idempotent)",
    a1b.status === 200 && (await enrollCount(b1.id)) === 5 && (await progMembers(b1.id)).length === 1 && (await orderOf(o1)).status === "paid", JSON.stringify(a1b));
  check("satın alma sonrası sepet satırı: owned (üye)", line(await quote([P], b1.cookie), PK)?.status === "owned");

  // sahte istemci fiyatı yok sayılır; bekleyen sipariş yeniden kullanılır (anahtar program:<id>)
  const bf = await mkBuyer("forged");
  await own(bf.id, courseIds.slice(0, 3));
  const rf = await checkout(bf, { price: 1, amount: 1, total: 1 }, [{ type: "program", slug: PROGRAM_SLUG, price: 1 }]);
  check("sahte price/amount alanları: sipariş tutarı sunucu hesabı (1600)", rf.status === 201 && Number((await orderOf(rf.json?.orderId)).amount) === 1600, JSON.stringify(rf));
  const rf2 = await checkout(bf);
  const pendCount = Number((await db.query("SELECT COUNT(*) n FROM orders WHERE user_id = ? AND plan = 'cart' AND status = 'pending'", [bf.id]))[0][0].n);
  if (rf.json?.status === "pending") check("aynı program sepeti tekrar: bekleyen sipariş yeniden kullanıldı (tek sipariş, tek kalem)", rf2.json?.orderId === rf.json.orderId && pendCount === 1 && (await itemsOf(rf.json.orderId)).length === 1, JSON.stringify({ rf2: rf2.json, pendCount }));

  // Plus yükseltme: 3 kurs source=plus + aktif Plus → 4000; ödeme sonrası kalıcı kaynak
  const bp = await mkBuyer("buyplus");
  await own(bp.id, courseIds.slice(0, 3), "plus");
  await db.query("UPDATE users SET plus_until = DATE_ADD(NOW(), INTERVAL 20 DAY) WHERE id = ?", [bp.id]);
  const rp = await checkout(bp);
  check("Plus kaynaklı 3 kurs: sipariş 4000", rp.status === 201 && Number((await orderOf(rp.json?.orderId)).amount) === 4000, JSON.stringify(rp));
  await settle(rp);
  const srcp = await sources(bp.id, courseIds.slice(0, 5));
  check("Plus yükseltme: 5 kaydın hepsi purchase (ilk 3 plus -> purchase)", srcp.every((x) => x === "purchase") && (await enrollCount(bp.id)) === 5, JSON.stringify(srcp));
  check("Plus'lı kullanıcıda program üyeliği purchase", (await programMember(bp.id, programId))?.source === "purchase");

  // 5 kursun sertifikası var, program sonradan alınıyor → ödeme sonrası program sertifikası
  const bc = await mkBuyer("certfirst");
  await own(bc.id, courseIds.slice(0, 3));
  for (const [i, cid] of courseIds.slice(0, 5).entries()) await db.query("INSERT INTO certificates (user_id, course_id, certificate_code, score) VALUES (?, ?, ?, 90)", [bc.id, cid, `PRF-9${i}-${stamp % 1e6}`]);
  const rc = await checkout(bc);
  check("sertifikalı kullanıcı: checkout 201, tutar 1600", rc.status === 201 && Number((await orderOf(rc.json?.orderId)).amount) === 1600, JSON.stringify(rc));
  await settle(rc);
  const pcert = await waitFor(async () => (await progCerts(bc.id)).length === 1);
  check("5 kurs sertifikalı + program sonradan alındı: program sertifikası verildi, üyelik purchase kaldı", pcert && (await progCerts(bc.id)).length === 1 && (await progMembers(bc.id)).length === 1 && (await progMembers(bc.id))[0].source === "purchase", JSON.stringify({ c: await progCerts(bc.id), m: await progMembers(bc.id) }));

  // %100 kupon: anında paid, kupon bir kez sayılır
  const COUPON = `E2EPROG${stamp}`;
  const [cp] = await db.query("INSERT INTO coupons (code, discount_type, discount_value, max_uses_per_user) VALUES (?, 'percentage', 100, 1)", [COUPON]);
  const bk = await mkBuyer("coupon");
  await own(bk.id, courseIds.slice(0, 3));
  const rk = await checkout(bk, { coupon_code: COUPON });
  const ko = rk.json?.orderId ? await orderOf(rk.json.orderId) : null;
  check("%100 kupon: checkout 201 status paid, sipariş paid ve tutar 0", rk.status === 201 && rk.json?.status === "paid" && ko?.status === "paid" && Number(ko.amount) === 0, JSON.stringify({ rk, ko }));
  check("%100 kupon: 5 kurs + purchase üyelik, kupon 1 kez sayıldı", (await enrollCount(bk.id)) === 5 && (await programMember(bk.id, programId))?.source === "purchase" && Number((await db.query("SELECT COUNT(*) n FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?", [cp.insertId, bk.id]))[0][0].n) === 1);

  // Ücretsiz katılım: POST /api/programs/join
  const join = (cookie, slug = PROGRAM_SLUG) => api("/api/programs/join", { cookie, body: { slug } });
  const orderCount = async (userId) => Number((await db.query("SELECT COUNT(*) n FROM orders WHERE user_id = ?", [userId]))[0][0].n);
  const jg = await join("");
  check("join: girişsiz 401", jg.status === 401, String(jg.status));
  const jn = await mkBuyer("join3");
  await own(jn.id, courseIds.slice(0, 3));
  const j3 = await join(jn.cookie);
  check("join: 3/5 edinilmiş -> 4xx, üyelik yok", j3.status >= 400 && j3.status < 500 && j3.json?.success === false && typeof j3.json?.message === "string" && !(await programMember(jn.id, programId)), JSON.stringify(j3));
  const jp = await mkBuyer("joinplus");
  await own(jp.id, courseIds.slice(0, 5), "plus");
  const jpr = await join(jp.cookie);
  check("join: 5 kurs yalnızca Plus kaynaklı -> 4xx, üyelik yok", jpr.status >= 400 && jpr.status < 500 && !(await programMember(jp.id, programId)), JSON.stringify(jpr));
  const j5 = await mkBuyer("join5");
  await own(j5.id, courseIds.slice(0, 5));
  const jb = await join(j5.cookie, "bu-slug-yok");
  check("join: olmayan program 404", jb.status === 404, String(jb.status));
  const jbad = await api("/api/programs/join", { cookie: j5.cookie, body: {} });
  check("join: slug'sız gövde 400", jbad.status === 400, String(jbad.status));
  const jline = line(await quote([P], j5.cookie), PK);
  check("join öncesi sepet satırı: join ve joinable (gerçek sahiplik)", jline?.status === "join" && jline.joinable === true, JSON.stringify(jline));
  // Başka bir programın kursları sepette "edinilmiş" sayılıyor: tutar 0 ama joinable false (buton gösterilmez)
  const [p3] = await db.query("INSERT INTO programs (slug, code, title, description, price, is_published) VALUES (?, ?, 'E2E Alt Program', 'e2e', 1500, 1)", [`${PREFIX}-p3`, `PRG-E2E3-${stamp}`.slice(0, 30)]);
  await db.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES (?, ?, 0), (?, ?, 1)", [p3.insertId, courseIds[0], p3.insertId, courseIds[1]]);
  const subq = await quote([P, { type: "program", slug: `${PREFIX}-p3` }]);
  const subl = line(subq, `program:${PREFIX}-p3`);
  check("sepette önceki programın kurslarıyla kapanan program: join ama joinable false, toplam 4000", subl?.status === "join" && subl.joinable === false && subq.total === 4000, JSON.stringify({ subl, total: subq?.total }));
  const j5r = await join(j5.cookie);
  check("join: 5/5 edinilmiş -> 200 { slug }, program_enrollments auto, sipariş satırı yok",
    j5r.status === 200 && j5r.json?.slug === PROGRAM_SLUG && (await programMember(j5.id, programId))?.source === "auto" && (await orderCount(j5.id)) === 0, JSON.stringify(j5r));
  const j5again = await join(j5.cookie);
  check("join: zaten üye -> 4xx, tek üyelik satırı", j5again.status >= 400 && j5again.status < 500 && (await progMembers(j5.id)).length === 1, JSON.stringify(j5again));
  const jUn = await mkBuyer("joinunpub");
  await own(jUn.id, courseIds.slice(0, 5));
  await db.query("UPDATE programs SET is_published = 0 WHERE id = ?", [programId]);
  const jUnr = await join(jUn.cookie);
  await db.query("UPDATE programs SET is_published = 1 WHERE id = ?", [programId]);
  check("join: yayında olmayan program -> 404, üyelik yok", jUnr.status === 404 && !(await programMember(jUn.id, programId)), JSON.stringify(jUnr));
  // Tutar 0 ama sahiplik eksik: 0 TL program ve 0 TL eksik kurs ücretsiz katılımı açmamalı
  const zeroCourse = await mkCourse("z0", 0);
  const [pf] = await db.query("INSERT INTO programs (slug, code, title, description, price, is_published) VALUES (?, ?, 'E2E Bedava Program', 'e2e', 0, 1)", [`${PREFIX}-pfree`, `PRG-E2EF-${stamp}`.slice(0, 30)]);
  await db.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES (?, ?, 0), (?, ?, 1)", [pf.insertId, courseIds[0], pf.insertId, courseIds[1]]);
  const [pz] = await db.query("INSERT INTO programs (slug, code, title, description, price, is_published) VALUES (?, ?, 'E2E Sıfır Kurslu Program', 'e2e', 500, 1)", [`${PREFIX}-pzero`, `PRG-E2EZ-${stamp}`.slice(0, 30)]);
  await db.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES (?, ?, 0), (?, ?, 1)", [pz.insertId, courseIds[0], pz.insertId, zeroCourse]);
  const jz = await mkBuyer("joinzero");
  await own(jz.id, [courseIds[0]]);
  const jfr = await join(jz.cookie, `${PREFIX}-pfree`);
  check("join: 0 TL program, kursların biri sahipsiz -> 4xx, üyelik yok", jfr.status >= 400 && jfr.status < 500 && !(await progMembers(jz.id, pf.insertId)).length, JSON.stringify(jfr));
  const jzr = await join(jz.cookie, `${PREFIX}-pzero`);
  check("join: eksik kurs 0 TL (sahipsiz) -> 4xx, üyelik yok", jzr.status >= 400 && jzr.status < 500 && !(await progMembers(jz.id, pz.insertId)).length, JSON.stringify(jzr));
  await own(jz.id, [courseIds[1], zeroCourse]);
  const jzok = await join(jz.cookie, `${PREFIX}-pzero`);
  check("join: 0 TL kursa da sahip olunca başarılı (auto üyelik)", jzok.status === 200 && (await progMembers(jz.id, pz.insertId))[0]?.source === "auto", JSON.stringify(jzok));
  const jfok = await join(jz.cookie, `${PREFIX}-pfree`);
  check("join: 0 TL program, tüm kurslar sahipken başarılı", jfok.status === 200 && (await progMembers(jz.id, pf.insertId))[0]?.source === "auto", JSON.stringify(jfok));
  const jcert = await mkBuyer("joincert");
  await own(jcert.id, courseIds.slice(0, 5));
  for (const [i, cid] of courseIds.slice(0, 5).entries()) await db.query("INSERT INTO certificates (user_id, course_id, certificate_code, score) VALUES (?, ?, ?, 90)", [jcert.id, cid, `PRF-8${i}-${stamp % 1e6}`]);
  const jcr = await join(jcert.cookie);
  check("join: 5 kursu da sertifikalı kullanıcıya program sertifikası da verilir", jcr.status === 200 && (await waitFor(async () => (await progCerts(jcert.id)).length === 1)), JSON.stringify(jcr));
} catch (e) {
  failN++;
  console.log("✗ FAIL beklenmeyen hata:", e);
} finally {
  await db.query("DELETE FROM users WHERE email LIKE ?", [`${PREFIX}-%@example.invalid`]); // siparişler/üyelikler/sertifikalar/kayıtlar cascade
  await db.query("DELETE FROM coupon_redemptions WHERE coupon_id IN (SELECT id FROM coupons WHERE code LIKE ?)", [`E2EPROG${stamp}%`]);
  await db.query("DELETE FROM coupons WHERE code LIKE ?", [`E2EPROG${stamp}%`]);
  await db.query("DELETE FROM programs WHERE slug LIKE ?", [`${PREFIX}%`]); // program_courses cascade (kurs silinmeden önce)
  await db.query("DELETE FROM courses WHERE slug LIKE ?", [`${PREFIX}-c%`]); // quizzes/questions/options cascade
  const [[left]] = await db.query(
    "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c, (SELECT COUNT(*) FROM programs WHERE slug LIKE ?) p, (SELECT COUNT(*) FROM coupons WHERE code LIKE ?) k, (SELECT COUNT(*) FROM orders WHERE email LIKE ?) o",
    [`${PREFIX}-%`, `${PREFIX}-c%`, `${PREFIX}%`, `E2EPROG${stamp}%`, `${PREFIX}-%`]);
  console.log(`temizlik: kalan test kullanıcısı=${left.u}, kalan test kursu=${left.c}, kalan test programı=${left.p}, kalan kupon=${left.k}, kalan sipariş=${left.o}`);
  if (left.u || left.c || left.p || left.k || left.o) failN++;
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

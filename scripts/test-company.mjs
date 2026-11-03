import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { hashCode } from "../src/lib/verification-code.ts";
import { MEMBER_PURCHASE_BLOCK_MESSAGE, isCompanyCode } from "../src/lib/company-rules.ts";
// Şirket hesapları / kontenjan için uçtan uca test (çalışan sunucu + gerçek DB). Kendi kullanıcılarını, kursunu, şirketlerini
// ve siparişlerini oluşturur, sonunda hepsini siler (e-postalar e2e-company-<damga>-*, kurs slug'ı e2e-company-*).
// Kullanım:  MAIL_DRY_RUN=true npm run dev   →   npm run test:company
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
const SECRET = process.env.JWT_SECRET;
const PW = "Gecici-Sifre-4821!";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };

const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306) });
const stamp = Date.now();
const mail = (n, domain = "example.invalid") => `e2e-company-${stamp}-${n}@${domain}`;
const SLUG = `e2e-company-${stamp}`;
const NAME = (n) => `E2E Company ${stamp} ${n}`;
const DOM = (n) => `e2e${stamp}${n}.test`;

async function api(path, { method = "POST", body, cookie = "" } = {}) {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let json = null; try { json = await res.json(); } catch {}
  const auth = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("profect_auth_token="))?.split(";")[0] ?? "";
  return { status: res.status, json, auth };
}
const addUser = async (email, { role = "user", verified = 1, pw = PW, name } = {}) => {
  const [r] = await db.query("INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at, kvkk_consent_at) VALUES (?, ?, ?, ?, ?, IF(?=1, NOW(), NULL), NOW())", [name ?? "E2E " + email.split("-").pop().split("@")[0], email, await bcrypt.hash(pw, 10), role, verified, verified]);
  return r.insertId;
};
const login = async (email, pw = PW) => api("/api/auth/login", { body: { email, password: pw, turnstileToken: T } });
const cookieFor = async (email, pw = PW) => { const r = await login(email, pw); if (!r.auth) throw new Error(`giriş başarısız ${email}: ${r.status} ${JSON.stringify(r.json)}`); return r.auth; };
const setKnownCode = (id, code) => db.query("UPDATE users SET verification_token_hash=?, verification_token_expiry = NOW() + INTERVAL 10 MINUTE, verification_attempts=0 WHERE id=?", [hashCode(id, code, SECRET), id]);
const cooldownPassed = (id) => db.query("UPDATE users SET verification_sent_at = NOW() - INTERVAL 2 MINUTE WHERE id=?", [id]);
const userId = async (email) => (await db.query("SELECT id FROM users WHERE email=?", [email]))[0][0]?.id;
/** DB'ye doğrudan şirket (+uzantı +admin üyelik) ekler: API dışında hızlı hazırlık. */
async function addCompanyDb(name, domain, adminUserId) {
  const ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const code = "TEST-" + Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
  const [c] = await db.query("INSERT INTO companies (name, code) VALUES (?, ?)", [name, code]);
  if (domain) await db.query("INSERT INTO company_domains (company_id, domain) VALUES (?, ?)", [c.insertId, domain]);
  if (adminUserId) await db.query("INSERT INTO company_members (company_id, user_id, role, status, approved_at) VALUES (?, ?, 'admin', 'active', NOW())", [c.insertId, adminUserId]);
  const [[row]] = await db.query("SELECT code FROM companies WHERE id=?", [c.insertId]);
  return { id: c.insertId, code: row.code };
}
const member = async (uid) => (await db.query("SELECT * FROM company_members WHERE user_id=?", [uid]))[0][0];
const register = (body) => api("/api/auth/register", { body: { kvkk: true, turnstileToken: T, ...body } });
async function verifyAccount(email) {
  const id = await userId(email);
  await setKnownCode(id, "161803");
  return api("/api/auth/verify-email", { body: { email, code: "161803", password: PW } });
}

let courseId;
try {
  if (!SECRET) throw new Error("JWT_SECRET gerekli (npm run test:company .env'i yükler).");
  const [[tbl]] = await db.query("SHOW TABLES LIKE 'company_members'"); if (!tbl) throw new Error("şirket tabloları yok: önce npm run db:migrate");

  const [c] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 100, 1)", [SLUG, `E2E-${stamp}`.slice(0, 30), "E2E Şirket Kursu"]);
  courseId = c.insertId;
  const ADM = mail("platform-admin");
  await addUser(ADM, { role: "admin" });
  const platform = await cookieFor(ADM);

  // ── A. Kayıt, katılım ve üyelik ──────────────────────────────────────────────
  const D1 = DOM("a"), A1 = mail("admin1", D1);
  let r = await register({ full_name: "Şirket Yöneticisi", email: A1, account_type: "kurumsal", company: { company_name: NAME("A"), tax_office: "Kadıköy", tax_number: "1234567890", domain: D1 } });
  check("kurumsal kayıt 201", r.status === 201, JSON.stringify(r.json));
  r = await verifyAccount(A1);
  check("kurumsal hesap e-posta doğrulaması 200", r.status === 200, JSON.stringify(r.json));
  const [[coA]] = await db.query("SELECT c.* FROM companies c JOIN company_domains d ON d.company_id = c.id WHERE d.domain = ?", [D1]);
  check("doğrulamadan sonra şirket oluştu, kodu geçerli biçimde", !!coA && isCompanyCode(coA.code) && coA.name === NAME("A"), JSON.stringify(coA));
  const a1Id = await userId(A1);
  const mA1 = await member(a1Id);
  check("kayıt olan kişi şirketin aktif admini", mA1?.role === "admin" && mA1?.status === "active" && mA1?.company_id === coA?.id, JSON.stringify(mA1));
  const a1 = await cookieFor(A1);

  // Reddedilenler (Review Focus 4)
  const REJ = mail("rej", DOM("rej"));
  r = await register({ full_name: "Test Kişi", email: mail("rej-gmail", "gmail.com"), account_type: "kurumsal", company: { company_name: NAME("R"), tax_office: "Kadıköy", tax_number: "1234567890", domain: "gmail.com" } });
  check("genel posta uzantısıyla kurumsal kayıt 400 (uzantı nedeniyle)", r.status === 400 && /mail uzantısı/.test(r.json?.message ?? ""), JSON.stringify(r.json));
  r = await register({ full_name: "Test Kişi", email: REJ, account_type: "kurumsal", company: { company_name: NAME("R"), tax_office: "Kadıköy", tax_number: "1234567890", domain: DOM("baska") } });
  check("e-posta uzantısı şirket uzantısıyla uyuşmuyorsa 400 (uyuşmazlık nedeniyle)", r.status === 400 && /aynı olmalı/.test(r.json?.message ?? ""), JSON.stringify(r.json));
  r = await register({ full_name: "Test Kişi", email: mail("dup", D1), account_type: "kurumsal", company: { company_name: NAME("D"), tax_office: "Kadıköy", tax_number: "1234567890", domain: D1 } });
  check("başka şirkete ait uzantıyla kurumsal kayıt 409", r.status === 409, JSON.stringify(r.json));
  r = await register({ full_name: "Test Kişi", email: mail("badcode"), account_type: "bireysel", company_code: "kötü" });
  check("biçimsiz şirket koduyla bireysel kayıt 400", r.status === 400, JSON.stringify(r.json));
  r = await register({ full_name: "Test Kişi", email: mail("nocode"), account_type: "bireysel", company_code: "ZZZZ-2222" });
  check("var olmayan şirket koduyla bireysel kayıt 400", r.status === 400, JSON.stringify(r.json));

  // Bireysel + şirket kodu → doğrulamadan sonra bekleyen üyelik; Review Focus 3
  const B1 = mail("b1");
  r = await register({ full_name: "Bireysel Bir", email: B1, account_type: "bireysel", company_code: " " + coA.code.toLowerCase() + " " });
  check("bireysel + şirket kodu kayıt 201", r.status === 201, JSON.stringify(r.json));
  const b1Id = await userId(B1);
  check("doğrulamadan önce üyelik yok, niyet kayıtlı", !(await member(b1Id)) && (await db.query("SELECT kind FROM company_signup_intents WHERE user_id=?", [b1Id]))[0][0]?.kind === "join");
  const coB = await addCompanyDb(NAME("B"), DOM("b"), await addUser(mail("admin-b")));
  await cooldownPassed(b1Id);
  r = await register({ full_name: "Bireysel Bir", email: B1, account_type: "bireysel", company_code: coB.code });
  const [[intent]] = await db.query("SELECT payload FROM company_signup_intents WHERE user_id=?", [b1Id]);
  check("tekrar kayıt çağrısı kayıttaki şirket niyetini değiştirmez", !!intent && intent.payload.includes(coA.code) && !intent.payload.includes(coB.code), JSON.stringify(intent));
  r = await verifyAccount(B1);
  check("bireysel hesap doğrulaması 200", r.status === 200, JSON.stringify(r.json));
  const mb1 = await member(b1Id);
  check("kodla kayıt: üyelik pending/member ve ilk şirkette", mb1?.status === "pending" && mb1?.role === "member" && mb1?.company_id === coA.id, JSON.stringify(mb1));
  check("niyet tüketildi", !(await db.query("SELECT 1 FROM company_signup_intents WHERE user_id=?", [b1Id]))[0].length);

  // Mail uzantısından şirket bulma
  r = await api("/api/company/domain-lookup", { body: { email: `biri@${D1}` } });
  check("domain-lookup: eşleşen uzantı şirket adı ve kodu döner", r.json?.found === true && r.json.name === NAME("A") && r.json.code === coA.code, JSON.stringify(r.json));
  r = await api("/api/company/domain-lookup", { body: { email: "biri@bilinmeyen-alan.test" } });
  check("domain-lookup: eşleşmeyen uzantı found:false", r.json?.found === false, JSON.stringify(r.json));
  r = await api("/api/company/domain-lookup", { body: { email: "biri@gmail.com" } });
  check("domain-lookup: genel uzantı found:false", r.json?.found === false, JSON.stringify(r.json));

  // Giriş yapmış kullanıcı koduyla katılır
  const J = mail("joiner"), jId = await addUser(J), jc = await cookieFor(J);
  r = await api("/api/company/join", { cookie: jc, body: { code: coA.code } });
  check("giriş yapmış kullanıcı koduyla katılma isteği 200", r.status === 200, JSON.stringify(r.json));
  check("üyelik pending", (await member(jId))?.status === "pending");
  r = await api("/api/company/join", { cookie: jc, body: { code: coA.code } });
  check("zaten üyeyse tekrar katılma 409", r.status === 409, JSON.stringify(r.json));
  r = await api("/api/company/join", { cookie: await cookieFor(mail("platform-admin")), body: { code: "ZZZZ-2222" } });
  check("var olmayan kodla katılma 400", r.status === 400, JSON.stringify(r.json));
  r = await api("/api/company/join", { body: { code: coA.code } });
  check("oturumsuz katılma 401", r.status === 401);

  // Onay akışı
  const mpath = (companyId, memberId) => `/api/company/${companyId}/members/${memberId}`;
  r = await api(mpath(coA.id, mb1.id), { method: "PATCH", cookie: a1, body: { action: "approve" } });
  check("şirket admini katılımı onayladı (200)", r.status === 200, JSON.stringify(r.json));
  check("üyelik active", (await member(b1Id))?.status === "active");
  r = await api(mpath(coA.id, (await member(jId)).id), { method: "PATCH", cookie: platform, body: { action: "approve" } });
  check("ana admin de onaylayabilir (200)", r.status === 200, JSON.stringify(r.json));
  const K = mail("rejectme"), kId = await addUser(K), kc = await cookieFor(K);
  await api("/api/company/join", { cookie: kc, body: { code: coA.code } });
  r = await api(mpath(coA.id, (await member(kId)).id), { method: "PATCH", cookie: a1, body: { action: "reject" } });
  check("reddedilen katılım üyelik satırını siler", r.status === 200 && !(await member(kId)));
  r = await api(mpath(coA.id, mb1.id), { method: "PATCH", cookie: a1, body: { action: "promote" } });
  check("üye admin yapılabilir", r.status === 200 && (await member(b1Id))?.role === "admin", JSON.stringify(r.json));
  r = await api(mpath(coA.id, mb1.id), { method: "PATCH", cookie: a1, body: { action: "demote" } });
  check("ikinci admin düşürülebilir", r.status === 200 && (await member(b1Id))?.role === "member", JSON.stringify(r.json));
  r = await api(mpath(coA.id, mA1.id), { method: "PATCH", cookie: a1, body: { action: "demote" } });
  check("son admin düşürülemez (409)", r.status === 409, JSON.stringify(r.json));

  // Yetki sınırları (Review Focus 2)
  const bAdminEmail = (await db.query("SELECT u.email FROM users u JOIN company_members m ON m.user_id = u.id WHERE m.company_id = ?", [coB.id]))[0][0].email;
  const bAdmin = await cookieFor(bAdminEmail);
  r = await api(mpath(coA.id, mb1.id), { method: "PATCH", cookie: bAdmin, body: { action: "promote" } });
  check("başka şirketin admini 403", r.status === 403, JSON.stringify(r.json));
  r = await api(mpath(coB.id, mb1.id), { method: "PATCH", cookie: bAdmin, body: { action: "promote" } });
  check("kendi companyId'si ama başka şirketin memberId'si 404", r.status === 404, JSON.stringify(r.json));
  r = await api(mpath(coA.id, mb1.id), { method: "PATCH", cookie: await cookieFor(B1), body: { action: "promote" } });
  check("sıradan üye (admin değil) 403", r.status === 403, JSON.stringify(r.json));
  r = await api(mpath(coA.id, mb1.id), { method: "PATCH", body: { action: "promote" } });
  check("oturumsuz 401", r.status === 401);
  r = await api(mpath(999999999, mb1.id), { method: "PATCH", cookie: platform, body: { action: "promote" } });
  check("var olmayan şirket 404", r.status === 404, JSON.stringify(r.json));

  // ── B. Kontenjan: ekleme, atama, geri alma, üye çıkarma, rapor ────────────────
  const [mod] = await db.query("INSERT INTO modules (course_id, title, sort_order) VALUES (?, 'Mod', 1)", [courseId]);
  const [l1] = await db.query("INSERT INTO lessons (module_id, title, lesson_type, content, sort_order) VALUES (?, 'D1', 'text', 'x', 1)", [mod.insertId]);
  await db.query("INSERT INTO lessons (module_id, title, lesson_type, content, sort_order) VALUES (?, 'D2', 'text', 'x', 2)", [mod.insertId]);
  const [c2] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 100, 1)", [`${SLUG}-2`, `E2E2-${stamp}`.slice(0, 30), "E2E Şirket Kursu 2"]);
  const course2 = c2.insertId;

  const adminXEmail = mail("admin-x"), adminXId = await addUser(adminXEmail);
  const coX = await addCompanyDb(NAME("X"), DOM("x"), adminXId);
  const ax = await cookieFor(adminXEmail);
  const adminXMemberId = (await member(adminXId)).id;
  const addMember = async (n, status = "active", company = coX) => {
    const email = mail(n), uid = await addUser(email);
    await db.query("INSERT INTO company_members (company_id, user_id, role, status, approved_at) VALUES (?, ?, 'member', ?, IF(? = 'active', NOW(), NULL))", [company.id, uid, status, status]);
    return { uid, email, mid: (await member(uid)).id };
  };
  const m1 = await addMember("m1"), m2 = await addMember("m2"), m3 = await addMember("m3"), m4 = await addMember("m4"), m5 = await addMember("m5");
  const m6 = await addMember("m6"), m7 = await addMember("m7"), mp = await addMember("mp", "pending");
  const outsider = await addMember("outsider", "active", coB);

  const seat = async (companyId, cId) => {
    const [[x]] = await db.query(
      `SELECT COALESCE((SELECT SUM(quantity) FROM company_allocations WHERE company_id=? AND course_id=?),0) total,
              (SELECT COUNT(*) FROM company_assignments WHERE company_id=? AND course_id=? AND status='active') assigned,
              (SELECT COUNT(*) FROM company_assignments WHERE company_id=? AND course_id=? AND status='burned') burned`, [companyId, cId, companyId, cId, companyId, cId]);
    return { total: Number(x.total), assigned: Number(x.assigned), burned: Number(x.burned), free: Number(x.total) - Number(x.assigned) - Number(x.burned) };
  };
  const asg = async (uid, cId = courseId) => (await db.query("SELECT * FROM company_assignments WHERE company_id=? AND course_id=? AND user_id=?", [coX.id, cId, uid]))[0][0];
  const enr = async (uid, cId = courseId) => (await db.query("SELECT source, status FROM enrollments WHERE user_id=? AND course_id=?", [uid, cId]))[0][0];
  const alloc = (cookie, body, cid = coX.id) => api(`/api/company/${cid}/allocations`, { cookie, body });
  const assign = (cookie, uid, cId = courseId, cid = coX.id) => api(`/api/company/${cid}/assignments`, { cookie, body: { user_id: uid, course_id: cId } });
  const reclaim = (cookie, aid, body = {}, cid = coX.id) => api(`/api/company/${cid}/assignments/${aid}/reclaim`, { cookie, body });
  const progress = (n) => db.query("INSERT IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)", [n, l1.insertId]);

  // Kontenjan ekleme (yalnızca ana admin)
  r = await alloc(ax, { course_id: courseId, delta: 2 });
  check("şirket admini kontenjan tanımlayamaz (403)", r.status === 403, JSON.stringify(r.json));
  r = await alloc(platform, { course_id: courseId, delta: 0 });
  check("delta 0 reddedilir (400)", r.status === 400, JSON.stringify(r.json));
  r = await alloc(platform, { course_id: 999999999, delta: 1 });
  check("olmayan kurs reddedilir (400)", r.status === 400, JSON.stringify(r.json));
  r = await alloc(platform, { course_id: courseId, delta: 2 });
  check("ana admin kontenjan ekler (200), toplam 2", r.status === 200 && (await seat(coX.id, courseId)).total === 2, JSON.stringify(r.json));

  // Atama
  r = await assign(ax, m1.uid);
  check("aktif üyeye atama 200", r.status === 200, JSON.stringify(r.json));
  check("atama: enrollments source='company', assignment active, boş 1", (await enr(m1.uid))?.source === "company" && (await asg(m1.uid))?.status === "active" && (await seat(coX.id, courseId)).free === 1);
  r = await assign(ax, mp.uid);
  check("onay bekleyen üyeye atama 409", r.status === 409, JSON.stringify(r.json));
  r = await assign(ax, outsider.uid);
  check("başka şirketin üyesine atama 409", r.status === 409, JSON.stringify(r.json));
  await db.query("INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'admin')", [m3.uid, courseId]);
  r = await assign(ax, m3.uid);
  check("kursa zaten sahip kullanıcıya atama 409", r.status === 409 && (await seat(coX.id, courseId)).free === 1, JSON.stringify(r.json));
  r = await assign(ax, m2.uid);
  check("ikinci atama 200, boş 0", r.status === 200 && (await seat(coX.id, courseId)).free === 0, JSON.stringify(r.json));
  r = await assign(ax, m4.uid);
  check("boş kontenjan yokken atama 409", r.status === 409, JSON.stringify(r.json));

  // Geri alma: izlenmemiş → havuza döner
  const a2 = await asg(m2.uid);
  r = await reclaim(ax, a2.id);
  check("izlenmemiş eğitim: geri alma 200, outcome=return", r.status === 200 && r.json?.outcome === "return", JSON.stringify(r.json));
  check("geri alınan: assignment revoked, enrollments silindi, boş 1", (await asg(m2.uid))?.status === "revoked" && !(await enr(m2.uid)) && (await seat(coX.id, courseId)).free === 1);
  // Aynı kişiye yeniden verme: sertifikası varsa kayıt 'completed' açılır (Review Focus 5)
  await db.query("INSERT INTO certificates (user_id, course_id, certificate_code, score) VALUES (?, ?, ?, 90)", [m2.uid, courseId, `E2E-CERT-${stamp}-2`]);
  r = await assign(ax, m2.uid);
  check("geri alınmış atama aynı kişiye yeniden verilir; sertifikalıysa kayıt completed", r.status === 200 && (await enr(m2.uid))?.status === "completed" && (await asg(m2.uid))?.status === "active", JSON.stringify(r.json));
  r = await reclaim(ax, (await asg(m2.uid)).id);
  check("tekrar geri alma 200 (boş 1)", r.status === 200 && (await seat(coX.id, courseId)).free === 1, JSON.stringify(r.json));

  // Geri alma: izlenmiş → onay ister, onayla yanar
  await progress(m1.uid);
  const a1b = await asg(m1.uid);
  r = await reclaim(ax, a1b.id);
  check("izlenmiş eğitim: onaysız geri alma 409 (needs_confirm), atama sürer", r.status === 409 && r.json?.reason === "needs_confirm" && (await asg(m1.uid))?.status === "active" && !!(await enr(m1.uid)), JSON.stringify(r.json));
  r = await reclaim(ax, a1b.id, { confirm_burn: true });
  check("onayla geri alma 200, outcome=burn", r.status === 200 && r.json?.outcome === "burn", JSON.stringify(r.json));
  const sAfter = await seat(coX.id, courseId);
  check("yanan: assignment burned, enrollments silindi, kontenjan havuza dönmedi (boş 1)", (await asg(m1.uid))?.status === "burned" && !(await enr(m1.uid)) && sAfter.burned === 1 && sAfter.free === 1, JSON.stringify(sAfter));
  // Review Focus 5: ilerleme ve sertifika korunur, yanmış hak kimseye verilemez
  await db.query("INSERT INTO certificates (user_id, course_id, certificate_code, score) VALUES (?, ?, ?, 90)", [m1.uid, courseId, `E2E-CERT-${stamp}-1`]);
  check("yanan atamada ilerleme silinmedi", (await db.query("SELECT 1 FROM lesson_progress WHERE user_id=?", [m1.uid]))[0].length === 1);
  r = await api(`/api/public/certificates/E2E-CERT-${stamp}-1`, { method: "GET" });
  check("yanan atamada sertifika doğrulama linki çalışır (200)", r.status === 200, String(r.status));
  r = await assign(ax, m1.uid);
  check("yanmış hak aynı kişiye bile verilemez (409)", r.status === 409, JSON.stringify(r.json));
  r = await assign(ax, m4.uid);
  check("kalan boş kontenjan başkasına verilir (200)", r.status === 200, JSON.stringify(r.json));
  r = await assign(ax, m5.uid);
  check("yanan kontenjan havuza dönmediği için sonraki atama 409", r.status === 409, JSON.stringify(r.json));

  // Toplam düzenleme: kullanılanın altına inemez
  r = await alloc(platform, { course_id: courseId, delta: -1 });
  check("atanan+yanan altına inen azaltma 409", r.status === 409, JSON.stringify(r.json));
  r = await alloc(platform, { course_id: courseId, delta: 3 });
  check("artırma 200, toplam 5, boş 3", r.status === 200 && (await seat(coX.id, courseId)).free === 3, JSON.stringify(r.json));

  // Eş zamanlı son kontenjan (Review Focus 1)
  await alloc(platform, { course_id: course2, delta: 1 });
  const c1 = await addMember("c1"), c2m = await addMember("c2");
  const both = await Promise.all([assign(ax, c1.uid, course2), assign(ax, c2m.uid, course2)]);
  const codes = both.map((x) => x.status).sort();
  check("iki eş zamanlı son kontenjan atamasında tam biri başarılı", codes[0] === 200 && codes[1] === 409 && (await seat(coX.id, course2)).assigned === 1, JSON.stringify(codes));

  // Üye çıkarma
  await assign(ax, m6.uid); await assign(ax, m7.uid); await progress(m6.uid);
  r = await api(`/api/company/${coX.id}/members/${m6.mid}`, { method: "PATCH", cookie: ax, body: { action: "remove" } });
  check("izlenmiş eğitimi olan üyeyi çıkarma onaysız 409", r.status === 409 && r.json?.reason === "needs_confirm" && !!(await member(m6.uid)), JSON.stringify(r.json));
  r = await api(`/api/company/${coX.id}/members/${m6.mid}`, { method: "PATCH", cookie: ax, body: { action: "remove", confirm_burn: true } });
  check("onayla çıkarma 200: üyelik silinir, atama burned, kayıt silinir", r.status === 200 && !(await member(m6.uid)) && (await asg(m6.uid))?.status === "burned" && !(await enr(m6.uid)), JSON.stringify(r.json));
  r = await api(`/api/company/${coX.id}/members/${m7.mid}`, { method: "PATCH", cookie: ax, body: { action: "remove" } });
  check("izlenmemiş üyeyi çıkarma 200: atama revoked", r.status === 200 && !(await member(m7.uid)) && (await asg(m7.uid))?.status === "revoked", JSON.stringify(r.json));
  r = await api(`/api/company/${coX.id}/members/${adminXMemberId}`, { method: "PATCH", cookie: ax, body: { action: "remove" } });
  check("tek şirket adminini çıkarma 409", r.status === 409 && !!(await member(adminXId)), JSON.stringify(r.json));

  // İlerleme raporu
  await progress(m4.uid);
  r = await api(`/api/company/${coX.id}/progress`, { method: "GET", cookie: ax });
  const rows = r.json?.data ?? [];
  const row4 = rows.find((x) => x.userId === m4.uid && x.courseId === courseId);
  check("rapor: atanan üye ilerleme ve durumla listelenir", r.status === 200 && row4?.completedLessons === 1 && row4?.totalLessons === 2 && row4?.status === "in_progress" && row4?.certificateCode === null, JSON.stringify(row4));
  check("rapor: şirket dışı kayıt (admin ataması) ve geri alınmış/yanmış atamalar listelenmez", !rows.some((x) => x.userId === m3.uid || x.userId === m1.uid || x.userId === m7.uid), JSON.stringify(rows.map((x) => x.userId)));
  r = await api(`/api/company/${coX.id}/progress`, { method: "GET", cookie: platform });
  check("rapor: ana admin görebilir", r.status === 200);
  r = await api(`/api/company/${coX.id}/progress`, { method: "GET", cookie: bAdmin });
  check("rapor: başka şirketin admini 403", r.status === 403);
  r = await api(`/api/company/${coX.id}/progress`, { method: "GET" });
  check("rapor: oturumsuz 401", r.status === 401);

  // Yetki sınırı (Review Focus 2)
  const a4 = await asg(m4.uid);
  r = await reclaim(bAdmin, a4.id, {}, coB.id);
  check("kendi companyId'si ama başka şirketin assignmentId'si 404", r.status === 404 && (await asg(m4.uid))?.status === "active", JSON.stringify(r.json));
  r = await reclaim(bAdmin, a4.id);
  check("başka şirketin yolundan geri alma 403", r.status === 403);
  r = await assign(bAdmin, m5.uid);
  check("başka şirketin yolundan atama 403", r.status === 403);

  // ── C. Üyelere bireysel satın alma kısıtı ve eğitim talebi ───────────────────
  const BILL = (email) => ({ invoice_type: "bireysel", full_name: "E2E Üye", email });
  const CONSENTS = { distance_sales: true, privacy: true, delivery_return: true, kvkk: true };
  const m5c = await cookieFor(m5.email);
  r = await api("/api/checkout", { cookie: m5c, body: { items: [{ type: "course", slug: SLUG }], billing: BILL(m5.email), consents: CONSENTS } });
  check("aktif üye sepetten kurs alamaz (403, kısıt mesajı)", r.status === 403 && r.json?.message === MEMBER_PURCHASE_BLOCK_MESSAGE, JSON.stringify(r.json));
  r = await api("/api/checkout", { cookie: m5c, body: { items: [{ type: "plus" }], billing: BILL(m5.email), consents: CONSENTS } });
  check("aktif üye Profect Plus alamaz (403)", r.status === 403 && r.json?.message === MEMBER_PURCHASE_BLOCK_MESSAGE, JSON.stringify(r.json));
  r = await api("/api/gifts/checkout", { cookie: m5c, body: { slug: SLUG, recipient_email: mail("hediye-alici"), billing: BILL(m5.email), consents: CONSENTS } });
  check("aktif üye hediye satın alamaz (403)", r.status === 403 && r.json?.message === MEMBER_PURCHASE_BLOCK_MESSAGE, JSON.stringify(r.json));
  r = await api("/api/checkout", { cookie: ax, body: { items: [{ type: "course", slug: SLUG }], billing: BILL(adminXEmail), consents: CONSENTS } });
  check("şirket admini de bireysel satın alamaz (403)", r.status === 403 && r.json?.message === MEMBER_PURCHASE_BLOCK_MESSAGE, JSON.stringify(r.json));
  const mpc = await cookieFor(mp.email);
  r = await api("/api/checkout", { cookie: mpc, body: { items: [{ type: "course", slug: SLUG }], billing: BILL(mp.email), consents: CONSENTS } });
  check("onay bekleyen üye kısıttan etkilenmez", r.json?.message !== MEMBER_PURCHASE_BLOCK_MESSAGE && r.status === 201, JSON.stringify(r.json));

  // Eğitim talebi
  const rq = (cookie, body) => api("/api/company/requests", { cookie, body });
  r = await rq(m5c, { course_id: courseId });
  check("aktif üye eğitim talep eder (200)", r.status === 200, JSON.stringify(r.json));
  r = await rq(m5c, { course_id: courseId });
  check("aynı kurs için ikinci açık talep 409", r.status === 409, JSON.stringify(r.json));
  r = await rq(mpc, { course_id: courseId });
  check("onay bekleyen üye talep edemez (403)", r.status === 403, JSON.stringify(r.json));
  r = await rq(await cookieFor(mail("platform-admin")), { course_id: courseId });
  check("şirketsiz kullanıcı talep edemez (403)", r.status === 403, JSON.stringify(r.json));
  r = await rq(await cookieFor(m3.email), { course_id: courseId });
  check("kursa zaten sahip üye talep edemez (409)", r.status === 409, JSON.stringify(r.json));
  r = await rq(m5c, { course_id: 999999999 });
  check("olmayan kurs için talep 400", r.status === 400, JSON.stringify(r.json));

  const req1 = (await db.query("SELECT id FROM company_course_requests WHERE user_id=? AND course_id=? AND status='pending'", [m5.uid, courseId]))[0][0];
  const rqPath = (cid, id) => `/api/company/${cid}/requests/${id}`;
  r = await api(rqPath(coB.id, req1.id), { cookie: bAdmin, body: { action: "reject" } });
  check("kendi companyId'si ama başka şirketin requestId'si 404", r.status === 404, JSON.stringify(r.json));
  r = await api(rqPath(coX.id, req1.id), { cookie: bAdmin, body: { action: "reject" } });
  check("başka şirketin admini talebi çözemez (403)", r.status === 403);
  r = await api(rqPath(coX.id, req1.id), { cookie: ax, body: { action: "assign" } });
  check("boş kontenjan varsa talep atamayla çözülür (200), kayıt açılır", r.status === 200 && (await enr(m5.uid))?.source === "company", JSON.stringify(r.json));
  check("talep fulfilled", (await db.query("SELECT status FROM company_course_requests WHERE id=?", [req1.id]))[0][0].status === "fulfilled");
  r = await api(rqPath(coX.id, req1.id), { cookie: ax, body: { action: "reject" } });
  check("çözülmüş talep tekrar çözülemez (409)", r.status === 409, JSON.stringify(r.json));

  await rq(m5c, { course_id: course2 });
  const req2 = (await db.query("SELECT id FROM company_course_requests WHERE user_id=? AND course_id=? AND status='pending'", [m5.uid, course2]))[0][0];
  r = await api(rqPath(coX.id, req2.id), { cookie: ax, body: { action: "assign" } });
  check("boş kontenjan yoksa atama 409 no_free ve talep bekler", r.status === 409 && r.json?.reason === "no_free" && (await db.query("SELECT status FROM company_course_requests WHERE id=?", [req2.id]))[0][0].status === "pending", JSON.stringify(r.json));
  r = await api(rqPath(coX.id, req2.id), { cookie: ax, body: { action: "reject" } });
  check("talep reddedilir (200)", r.status === 200 && (await db.query("SELECT status FROM company_course_requests WHERE id=?", [req2.id]))[0][0].status === "rejected", JSON.stringify(r.json));
  r = await rq(m5c, { course_id: course2 });
  check("reddedildikten sonra aynı kurs için yeni talep açılabilir (200)", r.status === 200, JSON.stringify(r.json));

  // ── D. Şirketin kontenjan satın alması ──────────────────────────────────────
  const [c3] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 0, 1)", [`${SLUG}-3`, `E2E3-${stamp}`.slice(0, 30), "E2E Ücretsiz Kurs"]);
  const KURUMSAL = (email) => ({ invoice_type: "kurumsal", full_name: "Şirket Yetkilisi", email, phone: "5321234567", company_name: NAME("X"), tax_office: "Kadıköy", tax_number: "1234567890", address: "Örnek Mah. Örnek Sok. No:1", city: "İstanbul", district: "Kadıköy", zip_code: "34000" });
  const seatBody = (email, quantity, slug = SLUG) => ({ slug, quantity, billing: KURUMSAL(email), consents: CONSENTS });
  const seatsPath = (cid) => `/api/company/${cid}/checkout`;
  const before = await seat(coX.id, courseId);
  r = await api(seatsPath(coX.id), { cookie: ax, body: seatBody(adminXEmail, 5) });
  check("şirket admini kontenjan siparişi verir (201, pending)", r.status === 201 && r.json?.status === "pending", JSON.stringify(r.json));
  const seatOrderId = r.json?.orderId;
  const [[so]] = await db.query("SELECT company_id, amount, plan, user_id FROM orders WHERE id=?", [seatOrderId]);
  const [soItems] = await db.query("SELECT item_type, course_id, quantity, unit_price, title FROM order_items WHERE order_id=?", [seatOrderId]);
  check("sipariş: company_id dolu, tutar fiyat × adet (500)", so?.company_id === coX.id && Number(so.amount) === 500 && so.plan === "cart", JSON.stringify(so));
  check("tek kalem: seats, adet 5, unit_price satır toplamı, başlık", soItems.length === 1 && soItems[0].item_type === "seats" && soItems[0].quantity === 5 && Number(soItems[0].unit_price) === 500 && soItems[0].course_id === courseId && soItems[0].title === "E2E Şirket Kursu · 5 kişilik kontenjan", JSON.stringify(soItems));
  check("ödeme onayından önce kontenjan artmaz", (await seat(coX.id, courseId)).total === before.total);
  r = await api(`/api/admin/orders/${seatOrderId}`, { method: "PATCH", cookie: platform, body: { action: "approve" } });
  check("admin siparişi onayladı (200)", r.status === 200, JSON.stringify(r.json));
  const afterBuy = await seat(coX.id, courseId);
  const [[alloc1]] = await db.query("SELECT source, order_id, quantity FROM company_allocations WHERE order_id=?", [seatOrderId]);
  check("onaydan sonra şirket kontenjanı +5 (source purchase, order_id dolu)", afterBuy.total === before.total + 5 && alloc1?.source === "purchase" && alloc1?.quantity === 5, JSON.stringify({ afterBuy, alloc1 }));
  check("kontenjan siparişi satın alanda kurs kaydı açmaz", !(await enr(adminXId)));
  await api(`/api/admin/orders/${seatOrderId}`, { method: "PATCH", cookie: platform, body: { action: "approve" } });
  check("onay tekrarı kontenjanı ikinci kez artırmaz", (await seat(coX.id, courseId)).total === before.total + 5);

  r = await api(seatsPath(coX.id), { cookie: m5c, body: seatBody(m5.email, 1) });
  check("sıradan üye kontenjan alamaz (403)", r.status === 403, JSON.stringify(r.json));
  r = await api(seatsPath(coX.id), { cookie: bAdmin, body: seatBody(bAdminEmail, 1) });
  check("başka şirketin admini 403", r.status === 403);
  r = await api(seatsPath(coX.id), { cookie: ax, body: seatBody(adminXEmail, 0) });
  check("adet 0 reddedilir (400)", r.status === 400, JSON.stringify(r.json));
  r = await api(seatsPath(coX.id), { cookie: ax, body: seatBody(adminXEmail, 1001) });
  check("adet 1001 reddedilir (400)", r.status === 400, JSON.stringify(r.json));
  r = await api(seatsPath(coX.id), { cookie: ax, body: seatBody(adminXEmail, 2, `${SLUG}-3`) });
  check("ücretsiz kurs için kontenjan alınamaz (400)", r.status === 400, JSON.stringify(r.json));
  r = await api(seatsPath(coX.id), { cookie: ax, body: seatBody(adminXEmail, 2, "yok-" + stamp) });
  check("olmayan kurs 404", r.status === 404, JSON.stringify(r.json));
  r = await api(seatsPath(coX.id), { body: seatBody(adminXEmail, 1) });
  check("oturumsuz 401", r.status === 401);

  // Kontenjan siparişi normal sepet siparişiyle karışmaz (bekleyen sipariş yeniden kullanımı)
  r = await api(seatsPath(coX.id), { cookie: platform, body: seatBody(ADM, 1) });
  check("ana admin şirket adına sipariş verebilir (201)", r.status === 201, JSON.stringify(r.json));
  const platformSeatOrder = r.json?.orderId;
  r = await api("/api/checkout", { cookie: platform, body: { items: [{ type: "course", slug: SLUG }], billing: BILL(ADM), consents: CONSENTS } });
  const [[po]] = await db.query("SELECT company_id, amount FROM orders WHERE id=?", [platformSeatOrder]);
  const [poItems] = await db.query("SELECT item_type FROM order_items WHERE order_id=?", [platformSeatOrder]);
  check("aynı kullanıcının kurs sepeti kontenjan siparişini yeniden kullanmaz", r.status === 201 && r.json?.orderId !== platformSeatOrder && po?.company_id === coX.id && Number(po.amount) === 100 && poItems[0]?.item_type === "seats", JSON.stringify({ r: r.json, po, poItems }));

  // ── SECTION: devam eden görevlerin kontrolleri bu işaretin üstüne eklenir ──
} catch (e) {
  failN++; console.error("✗ BEKLENMEYEN HATA", e);
} finally {
  await db.query("DELETE FROM certificates WHERE certificate_code LIKE ?", [`E2E-CERT-${stamp}-%`]);
  await db.query("DELETE FROM users WHERE email LIKE ?", [`e2e-company-${stamp}-%`]); // siparişler/üyelikler/atamalar cascade
  await db.query("DELETE FROM companies WHERE name LIKE ?", [`E2E Company ${stamp} %`]);
  await db.query("DELETE FROM courses WHERE slug LIKE ?", [`${SLUG}%`]);
  const [[left]] = await db.query("SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c, (SELECT COUNT(*) FROM companies WHERE name LIKE ?) co", [`e2e-company-${stamp}-%`, `${SLUG}%`, `E2E Company ${stamp} %`]);
  console.log(`temizlik: kalan test kullanıcısı=${left.u}, kurs=${left.c}, şirket=${left.co}`);
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

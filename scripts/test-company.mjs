import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { hashCode } from "../src/lib/verification-code.ts";
import { isCompanyCode } from "../src/lib/company-rules.ts";
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
  const m1 = await member(a1Id);
  check("kayıt olan kişi şirketin aktif admini", m1?.role === "admin" && m1?.status === "active" && m1?.company_id === coA?.id, JSON.stringify(m1));
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
  r = await api(mpath(coA.id, m1.id), { method: "PATCH", cookie: a1, body: { action: "demote" } });
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

  // ── SECTION: devam eden görevlerin kontrolleri bu işaretin üstüne eklenir ──
} catch (e) {
  failN++; console.error("✗ BEKLENMEYEN HATA", e);
} finally {
  await db.query("DELETE FROM users WHERE email LIKE ?", [`e2e-company-${stamp}-%`]); // siparişler/üyelikler/atamalar cascade
  await db.query("DELETE FROM companies WHERE name LIKE ?", [`E2E Company ${stamp} %`]);
  await db.query("DELETE FROM courses WHERE slug = ?", [SLUG]);
  const [[left]] = await db.query("SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug=?) c, (SELECT COUNT(*) FROM companies WHERE name LIKE ?) co", [`e2e-company-${stamp}-%`, SLUG, `E2E Company ${stamp} %`]);
  console.log(`temizlik: kalan test kullanıcısı=${left.u}, kurs=${left.c}, şirket=${left.co}`);
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

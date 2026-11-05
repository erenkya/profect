import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
// Yönetici → Kayıtlar: programa toplu atama için uçtan uca test (çalışan sunucu + gerçek DB, 022 migration'ı uygulanmış olmalı).
// Kendi kullanıcılarını/kurslarını/programını oluşturur, sonunda siler (e-postalar @example.invalid, slug'lar e2e-admprog-*).
// Kullanım:  npm run dev   →   BASE_URL=http://localhost:3000 npm run test:admin-program-enrollment
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
const PW = "Gecici-Sifre-4821!";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };

const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306) });
const stamp = Date.now();
const PREFIX = `e2e-admprog-${stamp}`;
const mail = (n) => `${PREFIX}-${n}@example.invalid`;

async function api(path, { method = "POST", body, cookie = "" } = {}) {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let json = null; try { json = await res.json(); } catch {}
  const auth = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("profect_auth_token="))?.split(";")[0] ?? "";
  return { status: res.status, json, auth };
}
const addUser = async (email, role = "user") => {
  const [r] = await db.query("INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at, kvkk_consent_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())", ["E2E " + email.split("-").pop().split("@")[0], email, await bcrypt.hash(PW, 10), role]);
  return r.insertId;
};
const cookieFor = async (email) => {
  const r = await api("/api/auth/login", { body: { email, password: PW, turnstileToken: T } });
  if (!r.auth) throw new Error(`giriş başarısız ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.auth;
};
const q = async (sql, params) => (await db.query(sql, params))[0];

try {
  const [[col]] = await db.query("SHOW COLUMNS FROM program_enrollments LIKE 'source'");
  if (!String(col.Type).includes("'admin'")) throw new Error("program_enrollments.source 'admin' içermiyor: önce npm run db:migrate");

  // Hazırlık: 3 kurs, 1 program (3 kurs), 1 ayrı kurs, 2 kullanıcı + admin
  const courseIds = [];
  for (let i = 1; i <= 4; i++) {
    const [c] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 1000, 1)", [`${PREFIX}-c${i}`, `E2EAP-${stamp}-${i}`.slice(0, 30), `E2E Atama Kursu ${i}`]);
    courseIds.push(c.insertId);
  }
  const [p] = await db.query("INSERT INTO programs (slug, code, title, description, price, is_published) VALUES (?, ?, 'E2E Atama Programı', 'e2e', 2000, 0)", [PREFIX, `PRG-E2EAP-${stamp}`.slice(0, 30)]);
  const programId = p.insertId;
  for (const [i, cid] of courseIds.slice(0, 3).entries()) await db.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES (?, ?, ?)", [programId, cid, i]);
  const u1 = await addUser(mail("u1")), u2 = await addUser(mail("u2")), nonAdm = await addUser(mail("plain"));
  await addUser(mail("admin"), "admin");
  const adm = await cookieFor(mail("admin"));
  const user = await cookieFor(mail("plain"));
  const EP = "/api/admin/enrollments";

  // Yetki ve doğrulama
  check("admin olmayan: 403", (await api(EP, { body: { user_ids: [u1], program_ids: [programId] }, cookie: user })).status === 403);
  check("hiç kurs/program seçilmezse 400", (await api(EP, { body: { user_ids: [u1] }, cookie: adm })).status === 400);
  check("var olmayan program: 404", (await api(EP, { body: { user_ids: [u1], program_ids: [2147483000] }, cookie: adm })).status === 404);

  // Yalnızca program ataması
  const r1 = await api(EP, { body: { user_ids: [u1, u2], program_ids: [programId] }, cookie: adm });
  check("program ataması 201, 2 üyelik oluştu", r1.status === 201 && r1.json?.program_created === 2 && r1.json?.program_skipped === 0, JSON.stringify(r1.json));
  const pe = await q("SELECT user_id, source FROM program_enrollments WHERE program_id = ?", [programId]);
  check("program_enrollments.source = admin (2 satır)", pe.length === 2 && pe.every((r) => r.source === "admin"), JSON.stringify(pe));
  for (const uid of [u1, u2]) {
    const en = await q("SELECT course_id, source FROM enrollments WHERE user_id = ?", [uid]);
    check(`kullanıcı ${uid}: programın 3 kursuna admin kaynaklı erişim, 4. kursa yok`, en.length === 3 && en.every((r) => r.source === "admin" && courseIds.slice(0, 3).includes(r.course_id)), JSON.stringify(en));
  }

  // Tekrar atama atlanır
  const r2 = await api(EP, { body: { user_ids: [u1, u2], program_ids: [programId] }, cookie: adm });
  check("tekrar atama: 0 yeni, 2 atlandı", r2.status === 201 && r2.json?.program_created === 0 && r2.json?.program_skipped === 2, JSON.stringify(r2.json));

  // Kurs + program birlikte; kurs kaydı yoksa eklenir
  const r3 = await api(EP, { body: { user_ids: [u1], course_ids: [courseIds[3]], program_ids: [programId] }, cookie: adm });
  check("kurs+program birlikte: 1 kurs kaydı, program atlandı", r3.status === 201 && r3.json?.created === 1 && r3.json?.program_skipped === 1, JSON.stringify(r3.json));

  // Sadece kurs (eski davranış)
  const r4 = await api(EP, { body: { user_ids: [u2], course_ids: [courseIds[3]] }, cookie: adm });
  check("yalnızca kurs ataması hâlâ çalışır", r4.status === 201 && r4.json?.created === 1 && r4.json?.program_created === 0, JSON.stringify(r4.json));

  // Silme: yalnızca program üyeliği gider, kurs kayıtları kalır
  const [pe1] = await q("SELECT id FROM program_enrollments WHERE user_id = ? AND program_id = ?", [u1, programId]);
  check("admin olmayan program üyeliğini silemez", (await api(`${EP}?program_enrollment_id=${pe1.id}`, { method: "DELETE", cookie: user })).status === 403);
  const d = await api(`${EP}?program_enrollment_id=${pe1.id}`, { method: "DELETE", cookie: adm });
  check("program üyeliği silindi", d.status === 200 && (await q("SELECT 1 FROM program_enrollments WHERE id = ?", [pe1.id])).length === 0, JSON.stringify(d.json));
  check("kurs kayıtları yerinde kaldı (4)", (await q("SELECT 1 FROM enrollments WHERE user_id = ?", [u1])).length === 4);

  // Sayfa
  const res = await fetch(B + "/admin/kayitlar", { headers: { cookie: adm } });
  const html = (await res.text()).replaceAll("<!-- -->", "");
  check("/admin/kayitlar: Programlar listesi ve program üyelikleri bölümü", res.status === 200 && html.includes("Program üyelikleri") && html.includes("E2E Atama Programı"), String(res.status));
} catch (e) {
  failN++;
  console.log("✗ FAIL beklenmeyen hata:", e);
} finally {
  await db.query("DELETE FROM users WHERE email LIKE ?", [`${PREFIX}-%@example.invalid`]); // üyelikler/kayıtlar cascade
  await db.query("DELETE FROM programs WHERE slug LIKE ?", [`${PREFIX}%`]);
  await db.query("DELETE FROM courses WHERE slug LIKE ?", [`${PREFIX}-c%`]);
  const [[left]] = await db.query("SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c, (SELECT COUNT(*) FROM programs WHERE slug LIKE ?) p", [`${PREFIX}-%`, `${PREFIX}-c%`, `${PREFIX}%`]);
  console.log(`temizlik: kalan kullanıcı=${left.u}, kurs=${left.c}, program=${left.p}`);
  if (left.u || left.c || left.p) failN++;
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { addProgramAllocation, assignProgramSeat, getProgramSeatSummaries, reclaimProgramSeat } from "../src/lib/company-program-seats.ts";
import { addAllocation, assignSeat, reclaimSeat, removeMember } from "../src/lib/company-seats.ts";
import { SUPPORT_EMAIL } from "../src/lib/company-copy.ts";
import { getCompanyPanelData } from "../src/lib/company-panel.ts";
import { cellKey } from "../src/lib/assign-matrix.ts";
// Şirket program kontenjanı için uçtan uca test (gerçek DB; veri katmanını doğrudan çağırır, API için çalışan sunucu gerekir).
// Kendi kullanıcılarını, kurslarını, programlarını ve şirketini oluşturur, sonunda hepsini siler (ad öneki e2e-cprog-<damga>).
// Kullanım:  npm run test:company-programs
const B = process.env.BASE_URL ?? "http://localhost:3000";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };

const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306) });
const stamp = Date.now();
const P = `e2e-cprog-${stamp}`;
const T = "XXXX.DUMMY.TOKEN.XXXX";
const PW = "Gecici-Sifre-4821!";
const HASH = await bcrypt.hash(PW, 10);
const created = { users: [], companies: [], programs: [], courses: [] };
const lessonOf = {}; // courseId → dersin id'si (izlenme senaryoları için)
async function api(path, { method = "POST", body, cookie = "" } = {}) {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let json = null; try { json = await res.json(); } catch {}
  const auth = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("profect_auth_token="))?.split(";")[0] ?? "";
  return { status: res.status, json, auth };
}
const cookieFor = async (email) => { const r = await api("/api/auth/login", { body: { email, password: PW, turnstileToken: T } }); if (!r.auth) throw new Error(`giriş başarısız ${email}: ${r.status} ${JSON.stringify(r.json)}`); return r.auth; };
const addUser = async (n, role = "user") => { const [r] = await db.query("INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at, kvkk_consent_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())", [`E2E ${n}`, `${P}-${n}@example.invalid`, HASH, role]); created.users.push(r.insertId); return r.insertId; };
const emailOf = (n) => `${P}-${n}@example.invalid`;
const addCourse = async (n) => { const [r] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 100, 1)", [`${P}-c${n}`, `E2C${n}-${stamp}`.slice(0, 30), `E2E Kurs ${n}`]); created.courses.push(r.insertId);
  const [mo] = await db.query("INSERT INTO modules (course_id, title, sort_order) VALUES (?, 'Mod', 1)", [r.insertId]);
  const [le] = await db.query("INSERT INTO lessons (module_id, title, lesson_type, content, sort_order) VALUES (?, 'D1', 'text', 'x', 1)", [mo.insertId]);
  lessonOf[r.insertId] = le.insertId;
  return r.insertId; };
const addProgram = async (n, courseIds) => {
  const [r] = await db.query("INSERT INTO programs (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 150, 1)", [`${P}-p${n}`, `E2P${n}-${stamp}`.slice(0, 30), `E2E Program ${n}`]);
  created.programs.push(r.insertId);
  for (const [i, c] of courseIds.entries()) await db.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES (?, ?, ?)", [r.insertId, c, i]);
  return r.insertId;
};
const addCompany = async (n) => { const [r] = await db.query("INSERT INTO companies (name, code) VALUES (?, ?)", [`E2E ${P} ${n}`, `TST${n}-${String(stamp).slice(-4)}`.slice(0, 12).replace(/[^A-Z0-9-]/gi, "X")]); created.companies.push(r.insertId); return r.insertId; };
const addMember = (companyId, userId, { role = "member", status = "active" } = {}) => db.query("INSERT INTO company_members (company_id, user_id, role, status, approved_at) VALUES (?, ?, ?, ?, NOW())", [companyId, userId, role, status]);
const q = async (sql, params) => (await db.query(sql, params))[0];
const sum = async (companyId, programId) => (await getProgramSeatSummaries(companyId)).find((s) => s.programId === programId);

try {
  const c1 = await addCourse(1), c2 = await addCourse(2);
  const prog = await addProgram(1, [c1, c2]);
  const progEmpty = await addProgram(2, []);
  const co = await addCompany(1);
  const [admin, m1, m2, m3, pending, outsider] = await Promise.all(["admin", "m1", "m2", "m3", "pending", "outsider"].map(addUser));
  await addMember(co, admin, { role: "admin" });
  for (const u of [m1, m2, m3]) await addMember(co, u);
  await addMember(co, pending, { status: "pending" });

  // ── A. Program kontenjanı: ekleme / azaltma ──────────────────────────────────
  let r = await addProgramAllocation({ companyId: co, programId: prog, delta: 0, source: "admin", createdBy: admin });
  check("delta 0 reddedilir (zero)", !r.ok && r.reason === "zero", JSON.stringify(r));
  r = await addProgramAllocation({ companyId: co, programId: 999999999, delta: 3, source: "admin", createdBy: admin });
  check("olmayan program reddedilir (no_program)", !r.ok && r.reason === "no_program", JSON.stringify(r));
  r = await addProgramAllocation({ companyId: co, programId: prog, delta: 3, source: "admin", createdBy: admin });
  check("program kontenjanı eklenir", r.ok, JSON.stringify(r));
  let s = await sum(co, prog);
  check("özet: toplam 3, boş 3", s?.total === 3 && s.free === 3 && s.assigned === 0 && s.burned === 0, JSON.stringify(s));
  check("kurs kontenjanı artmadı", (await q("SELECT COUNT(*) n FROM company_allocations WHERE company_id=?", [co]))[0].n === 0);

  // ── B. Program atama ─────────────────────────────────────────────────────────
  r = await assignProgramSeat({ companyId: co, programId: prog, userId: m1, assignedBy: admin });
  check("üyeye program atanır", r.ok, JSON.stringify(r));
  check("program_enrollments source=company", (await q("SELECT source FROM program_enrollments WHERE user_id=? AND program_id=?", [m1, prog]))[0]?.source === "company");
  const enrs = await q("SELECT course_id, source FROM enrollments WHERE user_id=? ORDER BY course_id", [m1]);
  check("programdaki her kursa company kaynaklı kayıt açıldı", enrs.length === 2 && enrs.every((e) => e.source === "company") && enrs[0].course_id === c1 && enrs[1].course_id === c2, JSON.stringify(enrs));
  s = await sum(co, prog);
  check("özet: atanan 1, boş 2", s?.assigned === 1 && s.free === 2, JSON.stringify(s));

  r = await assignProgramSeat({ companyId: co, programId: prog, userId: m1, assignedBy: admin });
  check("aynı programa ikinci atama reddedilir (already_member)", !r.ok && r.reason === "already_member", JSON.stringify(r));

  await db.query("INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'purchase')", [m2, c1]);
  r = await assignProgramSeat({ companyId: co, programId: prog, userId: m2, assignedBy: admin });
  check("programdaki bir kursa zaten sahip olan çalışana program yine atanır", r.ok, JSON.stringify(r));
  const e2 = await q("SELECT course_id, source FROM enrollments WHERE user_id=? ORDER BY course_id", [m2]);
  check("önceden satın alınan kursun kaynağı purchase kalır, eksik kurs company olur", e2[0].source === "purchase" && e2[1].source === "company", JSON.stringify(e2));
  s = await sum(co, prog);
  check("o atama da programdan bir hak düşer (atanan 2, boş 1)", s?.assigned === 2 && s.free === 1, JSON.stringify(s));

  r = await assignProgramSeat({ companyId: co, programId: prog, userId: outsider, assignedBy: admin });
  check("şirket üyesi olmayan not_member", !r.ok && r.reason === "not_member", JSON.stringify(r));
  r = await assignProgramSeat({ companyId: co, programId: prog, userId: pending, assignedBy: admin });
  check("onay bekleyen üye not_member", !r.ok && r.reason === "not_member", JSON.stringify(r));
  await addProgramAllocation({ companyId: co, programId: progEmpty, delta: 2, source: "admin", createdBy: admin });
  r = await assignProgramSeat({ companyId: co, programId: progEmpty, userId: m3, assignedBy: admin });
  check("kursu olmayan program atanamaz (empty_program)", !r.ok && r.reason === "empty_program", JSON.stringify(r));
  r = await assignProgramSeat({ companyId: co, programId: prog, userId: m3, assignedBy: admin });
  check("son boş kontenjan atanır", r.ok, JSON.stringify(r));
  const m4 = await addUser("m4"); await addMember(co, m4);
  r = await assignProgramSeat({ companyId: co, programId: prog, userId: m4, assignedBy: admin });
  check("kontenjan bitince no_free", !r.ok && r.reason === "no_free", JSON.stringify(r));
  r = await addProgramAllocation({ companyId: co, programId: prog, delta: -1, source: "admin", createdBy: admin });
  check("toplam atanan+yanandan aşağı indirilemez (below_used)", !r.ok && r.reason === "below_used", JSON.stringify(r));
  r = await addProgramAllocation({ companyId: co, programId: prog, delta: 2, source: "admin", createdBy: admin });
  r = await addProgramAllocation({ companyId: co, programId: prog, delta: -2, source: "admin", createdBy: admin });
  check("kullanılmayan kısım azaltılabilir", r.ok, JSON.stringify(r));

  // ── C. Program geri alma ─────────────────────────────────────────────────────
  // Bu bölüm kendi şirketi, kursları ve programıyla çalışır (A/B bölümünün durumundan bağımsız).
  const k1 = await addCourse(11), k2 = await addCourse(12), k3 = await addCourse(13);
  const pg = await addProgram(11, [k1, k2]);
  const co2 = await addCompany(2);
  const [adm2, u1, u2, u3, u4] = await Promise.all(["adm2", "u1", "u2", "u3", "u4"].map(addUser));
  await addMember(co2, adm2, { role: "admin" });
  for (const u of [u1, u2, u3, u4]) await addMember(co2, u);
  await addProgramAllocation({ companyId: co2, programId: pg, delta: 10, source: "admin", createdBy: adm2 });
  await addAllocation({ companyId: co2, courseId: k1, delta: 10, source: "admin", createdBy: adm2 });
  const enrOf = async (uid) => q("SELECT course_id, source FROM enrollments WHERE user_id=? ORDER BY course_id", [uid]);
  const asgStatus = async (uid) => (await q("SELECT id, status FROM company_program_assignments WHERE company_id=? AND program_id=? AND user_id=?", [co2, pg, uid]))[0];

  // C1. İzlenmemiş program atamasını geri alma: hak havuza döner, company kayıtları gider, başka kaynaklı kayıt kalır.
  await db.query("INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'purchase')", [u2, k1]);
  await assignProgramSeat({ companyId: co2, programId: pg, userId: u1, assignedBy: adm2 });
  await assignProgramSeat({ companyId: co2, programId: pg, userId: u2, assignedBy: adm2 });
  const a1 = await asgStatus(u1), a2 = await asgStatus(u2);
  r = await reclaimProgramSeat({ companyId: co2, assignmentId: a1.id, confirmBurn: false });
  check("izlenmemiş program ataması geri alınır (return)", r.ok && r.outcome === "return", JSON.stringify(r));
  check("atama revoked, hak havuza döndü", (await asgStatus(u1)).status === "revoked" && (await sum(co2, pg)).free === 9, JSON.stringify(await sum(co2, pg)));
  check("company kaynaklı program üyeliği ve kurs kayıtları silindi", (await enrOf(u1)).length === 0 && (await q("SELECT 1 FROM program_enrollments WHERE user_id=? AND program_id=?", [u1, pg])).length === 0);
  r = await reclaimProgramSeat({ companyId: co2, assignmentId: a2.id, confirmBurn: false });
  const e2b = await enrOf(u2);
  check("başka kaynaklı (purchase) kurs kaydı silinmez, company olan silinir", r.ok && e2b.length === 1 && e2b[0].course_id === k1 && e2b[0].source === "purchase", JSON.stringify(e2b));
  r = await reclaimProgramSeat({ companyId: co2, assignmentId: a1.id, confirmBurn: false });
  check("zaten geri alınmış atama not_found", !r.ok && r.reason === "not_found", JSON.stringify(r));
  r = await assignProgramSeat({ companyId: co2, programId: pg, userId: u1, assignedBy: adm2 });
  check("geri alınan hak aynı kullanıcıya yeniden verilebilir", r.ok, JSON.stringify(r));
  await reclaimProgramSeat({ companyId: co2, assignmentId: (await asgStatus(u1)).id, confirmBurn: false });

  // C2. Başka atamayla karşılanan kurs kaydı silinmez (Review Focus 3), iki yönde.
  r = await assignSeat({ companyId: co2, courseId: k1, userId: u3, assignedBy: adm2 });
  check("kurs ataması yapıldı (company kaydı)", r.ok, JSON.stringify(r));
  r = await assignProgramSeat({ companyId: co2, programId: pg, userId: u3, assignedBy: adm2 });
  check("kurs atanmış çalışana program da atanır", r.ok, JSON.stringify(r));
  r = await reclaimProgramSeat({ companyId: co2, assignmentId: (await asgStatus(u3)).id, confirmBurn: false });
  let e3 = await enrOf(u3);
  check("program geri alınınca aktif kurs ataması karşılayan kurs (k1) kalır, k2 gider", r.ok && e3.length === 1 && e3[0].course_id === k1 && e3[0].source === "company", JSON.stringify(e3));
  await assignProgramSeat({ companyId: co2, programId: pg, userId: u3, assignedBy: adm2 });
  const ca3 = (await q("SELECT id FROM company_assignments WHERE company_id=? AND course_id=? AND user_id=? AND status='active'", [co2, k1, u3]))[0];
  r = await reclaimSeat({ companyId: co2, assignmentId: ca3.id, confirmBurn: false });
  e3 = await enrOf(u3);
  check("kurs ataması geri alınınca aktif program ataması karşılayan kurs kalır", r.ok && e3.some((e) => e.course_id === k1) && e3.length === 2, JSON.stringify(e3));
  await reclaimProgramSeat({ companyId: co2, assignmentId: (await asgStatus(u3)).id, confirmBurn: false });
  check("program da geri alınınca kayıtlar tamamen temizlenir", (await enrOf(u3)).length === 0);

  // C3. Başlanmış program: onay ister, onaylanırsa yanar; sertifika silinmez.
  await assignProgramSeat({ companyId: co2, programId: pg, userId: u4, assignedBy: adm2 });
  await db.query("INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)", [u4, lessonOf[k2]]);
  await db.query("INSERT INTO program_certificates (user_id, program_id, certificate_code) VALUES (?, ?, ?)", [u4, pg, `PRP-E2E-${String(stamp).slice(-6)}`]);
  const a4 = await asgStatus(u4);
  const before = await sum(co2, pg);
  r = await reclaimProgramSeat({ companyId: co2, assignmentId: a4.id, confirmBurn: false });
  check("programdaki bir kursa başlamış çalışanda onay istenir (needs_confirm)", !r.ok && r.reason === "needs_confirm" && r.programTitle === `E2E Program 11`, JSON.stringify(r));
  check("needs_confirm hiçbir şeyi değiştirmez", (await asgStatus(u4)).status === "active" && (await enrOf(u4)).length === 2 && (await sum(co2, pg)).free === before.free);
  r = await reclaimProgramSeat({ companyId: co2, assignmentId: a4.id, confirmBurn: true });
  check("onayla geri alınca hak yanar (burn)", r.ok && r.outcome === "burn" && (await asgStatus(u4)).status === "burned" && (await sum(co2, pg)).burned === 1, JSON.stringify(r));
  check("yanan kullanıcının erişimi kapandı, program sertifikası silinmedi", (await enrOf(u4)).length === 0 && (await q("SELECT 1 FROM program_certificates WHERE user_id=? AND program_id=?", [u4, pg])).length === 1);
  r = await assignProgramSeat({ companyId: co2, programId: pg, userId: u4, assignedBy: adm2 });
  check("yanan hak aynı kullanıcıya yeniden verilemez (burned)", !r.ok && r.reason === "burned", JSON.stringify(r));

  // C4. Üye çıkarma: başlanmış program ataması onay ister; onayla çıkarınca yanar.
  const u5 = await addUser("u5"); await addMember(co2, u5);
  await assignProgramSeat({ companyId: co2, programId: pg, userId: u5, assignedBy: adm2 });
  await db.query("INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)", [u5, lessonOf[k1]]);
  const memId = (await q("SELECT id FROM company_members WHERE company_id=? AND user_id=?", [co2, u5]))[0].id;
  let rm = await removeMember({ companyId: co2, memberId: memId, confirmBurn: false });
  check("başlanmış program ataması olan üyeyi çıkarmak onay ister, listede program başlığı var", !rm.ok && rm.reason === "needs_confirm" && rm.courseTitles?.includes("E2E Program 11"), JSON.stringify(rm));
  check("needs_confirm üyeyi silmedi", (await q("SELECT 1 FROM company_members WHERE id=?", [memId])).length === 1);
  rm = await removeMember({ companyId: co2, memberId: memId, confirmBurn: true });
  const a5 = (await q("SELECT status FROM company_program_assignments WHERE company_id=? AND program_id=? AND user_id=?", [co2, pg, u5]))[0];
  check("onayla çıkarılan üyenin program hakkı yanar, kayıtları silinir", rm.ok && a5.status === "burned" && (await enrOf(u5)).length === 0, JSON.stringify({ rm, a5 }));
  const u6 = await addUser("u6"); await addMember(co2, u6);
  await assignProgramSeat({ companyId: co2, programId: pg, userId: u6, assignedBy: adm2 });
  rm = await removeMember({ companyId: co2, memberId: (await q("SELECT id FROM company_members WHERE company_id=? AND user_id=?", [co2, u6]))[0].id, confirmBurn: false });
  check("başlanmamış program atamalı üye onaysız çıkarılır, hak havuza döner", rm.ok && (await q("SELECT status FROM company_program_assignments WHERE company_id=? AND user_id=?", [co2, u6]))[0].status === "revoked");

  // C5. HTTP: uyarı metni, yetki ve BOLA.
  const u7 = await addUser("u7"); await addMember(co2, u7);
  await assignProgramSeat({ companyId: co2, programId: pg, userId: u7, assignedBy: adm2 });
  await db.query("INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)", [u7, lessonOf[k1]]);
  const a7 = await asgStatus(u7);
  const ac2 = await cookieFor(emailOf("adm2"));
  const rcPath = (cid, id) => `/api/company/${cid}/program-assignments/${id}/reclaim`;
  r = await api(rcPath(co2, a7.id), { cookie: ac2, body: {} });
  check("HTTP: başlanmış program geri alma 409 needs_confirm", r.status === 409 && r.json?.reason === "needs_confirm", JSON.stringify(r.json));
  check("HTTP: uyarı 'yalnızca silinebilir' der ve destek e-postasını içerir", /yalnızca silinebilir/.test(r.json?.message ?? "") && (r.json?.message ?? "").includes(SUPPORT_EMAIL), r.json?.message);
  const otherAdmin = await addUser("otheradmin"); const coOther = await addCompany(3); await addMember(coOther, otherAdmin, { role: "admin" });
  const oc = await cookieFor(emailOf("otheradmin"));
  r = await api(rcPath(co2, a7.id), { cookie: oc, body: { confirm_burn: true } });
  check("HTTP: başka şirketin admini geri alamaz (403)", r.status === 403, JSON.stringify(r.json));
  r = await api(rcPath(coOther, a7.id), { cookie: oc, body: { confirm_burn: true } });
  check("HTTP: kendi companyId'si ama başka şirketin atama id'si 404", r.status === 404 && (await asgStatus(u7)).status === "active", JSON.stringify(r.json));
  r = await api(rcPath(co2, a7.id), { cookie: ac2, body: { confirm_burn: true } });
  check("HTTP: confirm_burn ile 200, atama burned", r.status === 200 && (await asgStatus(u7)).status === "burned", JSON.stringify(r.json));
  r = await api(rcPath(co2, a7.id), { body: {} });
  check("HTTP: oturumsuz 401", r.status === 401);

  // C6. HTTP: kurs geri alma ve üye çıkarma uyarıları da yeni metni taşır.
  const u8 = await addUser("u8"); await addMember(co2, u8);
  await assignSeat({ companyId: co2, courseId: k1, userId: u8, assignedBy: adm2 });
  await db.query("INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)", [u8, lessonOf[k1]]);
  const ca8 = (await q("SELECT id FROM company_assignments WHERE company_id=? AND course_id=? AND user_id=? AND status='active'", [co2, k1, u8]))[0];
  r = await api(`/api/company/${co2}/assignments/${ca8.id}/reclaim`, { cookie: ac2, body: {} });
  check("HTTP: başlanmış kurs geri alma 409, yeni uyarı metni + destek e-postası", r.status === 409 && r.json?.reason === "needs_confirm" && /yalnızca silinebilir/.test(r.json?.message ?? "") && (r.json?.message ?? "").includes(SUPPORT_EMAIL), JSON.stringify(r.json));
  const memId8 = (await q("SELECT id FROM company_members WHERE company_id=? AND user_id=?", [co2, u8]))[0].id;
  r = await api(`/api/company/${co2}/members/${memId8}`, { method: "PATCH", cookie: ac2, body: { action: "remove" } });
  check("HTTP: başlanmış çalışanı çıkarma 409, yeni uyarı metni + destek e-postası", r.status === 409 && r.json?.reason === "needs_confirm" && /yalnızca silinebilir/.test(r.json?.message ?? "") && (r.json?.message ?? "").includes(SUPPORT_EMAIL), JSON.stringify(r.json));

  // ── D. Program kontenjanı satın alma ────────────────────────────────────────
  const addFinal = async (courseId) => {
    const [qz] = await db.query("INSERT INTO quizzes (course_id, module_id, title, passing_score_percentage, mode) VALUES (?, NULL, 'E2E Final', 70, 'fixed')", [courseId]);
    const [qu] = await db.query("INSERT INTO questions (quiz_id, type, question_text, position) VALUES (?, 'single', 'E2E soru', 1)", [qz.insertId]);
    await db.query("INSERT INTO options (question_id, option_text, is_correct) VALUES (?, 'Doğru', 1), (?, 'Yanlış', 0)", [qu.insertId, qu.insertId]);
  };
  const [s1, s2] = [await addCourse(21), await addCourse(22)];
  await addFinal(s1); await addFinal(s2);
  const sellable = await addProgram(21, [s1, s2]); // fiyat 150 (kurslar 200)
  const free = await addProgram(22, [s1, s2]); await db.query("UPDATE programs SET price=0 WHERE id=?", [free]);
  const draft = await addProgram(23, [s1, s2]); await db.query("UPDATE programs SET is_published=0 WHERE id=?", [draft]);
  const noCourse = await addProgram(24, []); // kursu yok → sellable=false
  const co3 = await addCompany(4);
  const pa = await addUser("padm", "admin"); // platform admini
  const [adm3, mem3] = [await addUser("adm3"), await addUser("mem3")];
  await addMember(co3, adm3, { role: "admin" }); await addMember(co3, mem3);
  const ac3 = await cookieFor(emailOf("adm3")), mc3 = await cookieFor(emailOf("mem3")), plat = await cookieFor(emailOf("padm"));
  const BILL = (email) => ({ invoice_type: "kurumsal", full_name: "Şirket Yetkilisi", email, phone: "5321234567", company_name: `E2E ${P} 4`, tax_office: "Kadıköy", tax_number: "1234567890", address: "Örnek Mah. Örnek Sok. No:1", city: "İstanbul", district: "Kadıköy", zip_code: "34000" });
  const CONSENTS = { distance_sales: true, privacy: true, delivery_return: true, kvkk: true };
  const buy = (cookie, cid, slug, quantity, extra = {}) => api(`/api/company/${cid}/checkout`, { cookie, body: { kind: "program", slug, quantity, billing: BILL(emailOf("adm3")), consents: CONSENTS, ...extra } });
  const slugOf = async (id) => (await q("SELECT slug FROM programs WHERE id=?", [id]))[0].slug;
  const courseTotal = async (cid) => Number((await q("SELECT COALESCE(SUM(quantity),0) t FROM company_allocations WHERE company_id=?", [cid]))[0].t);

  r = await buy(ac3, co3, await slugOf(sellable), 4, { amount: 1, total: 1, price: 1 });
  check("program kontenjanı siparişi 201", r.status === 201 && Number.isInteger(r.json?.orderId), JSON.stringify(r.json));
  const oid = r.json?.orderId;
  const [[ord]] = await db.query("SELECT amount, company_id FROM orders WHERE id=?", [oid]);
  const [items] = await db.query("SELECT item_type, program_id, course_id, quantity, unit_price, title FROM order_items WHERE order_id=?", [oid]);
  check("tutar = program fiyatı × adet (istemci tutarı yok sayılır)", Number(ord.amount) === 600 && ord.company_id === co3, JSON.stringify(ord));
  check("tek kalem: program_seats, adet 4, unit_price satır toplamı, başlık", items.length === 1 && items[0].item_type === "program_seats" && items[0].program_id === sellable && items[0].course_id === null && items[0].quantity === 4 && Number(items[0].unit_price) === 600 && items[0].title === "E2E Program 21 · 4 kişilik program kontenjanı", JSON.stringify(items));
  if (r.json?.status === "pending") {
    check("ödeme onayından önce program kontenjanı artmaz", ((await sum(co3, sellable))?.total ?? 0) === 0);
    r = await api(`/api/admin/orders/${oid}`, { method: "PATCH", cookie: plat, body: { action: "approve" } });
    check("platform admini onaylar (200)", r.status === 200, JSON.stringify(r.json));
  } else check("ödeme sağlayıcısı anında ödenmiş saydı", r.json?.status === "paid");
  const [[al]] = await db.query("SELECT source, order_id, quantity FROM company_program_allocations WHERE order_id=?", [oid]);
  check("onaydan sonra program kontenjanı +4, source=purchase, order_id bağlı", (await sum(co3, sellable)).total === 4 && al?.source === "purchase" && al?.quantity === 4, JSON.stringify(al));
  check("kurs kontenjan toplamı değişmedi, program üyeliği/kaydı açılmadı", (await courseTotal(co3)) === 0 && (await q("SELECT 1 FROM program_enrollments WHERE user_id=? AND program_id=?", [adm3, sellable])).length === 0 && (await q("SELECT 1 FROM enrollments WHERE user_id=?", [adm3])).length === 0);
  await api(`/api/admin/orders/${oid}`, { method: "PATCH", cookie: plat, body: { action: "approve" } });
  check("onay tekrarı kontenjanı ikinci kez artırmaz", (await sum(co3, sellable)).total === 4);

  r = await buy(ac3, co3, await slugOf(free), 1);
  check("ücretsiz program kontenjanı 400", r.status === 400, JSON.stringify(r.json));
  r = await buy(ac3, co3, await slugOf(draft), 1);
  check("yayında olmayan program 404", r.status === 404, JSON.stringify(r.json));
  r = await buy(ac3, co3, await slugOf(noCourse), 1);
  check("kursu olmayan (satılamaz) program 400", r.status === 400, JSON.stringify(r.json));
  r = await buy(ac3, co3, "e2e-yok-boyle-program", 1);
  check("olmayan program 404", r.status === 404, JSON.stringify(r.json));
  r = await buy(mc3, co3, await slugOf(sellable), 1);
  check("şirket üyesi (admin değil) program kontenjanı alamaz (403)", r.status === 403, JSON.stringify(r.json));
  r = await buy(ac2, co3, await slugOf(sellable), 1);
  check("başka şirketin admini bu şirket adına program kontenjanı alamaz (403)", r.status === 403, JSON.stringify(r.json));
  r = await buy(ac3, co3, await slugOf(sellable), 1001);
  check("adet 1001 reddedilir (400)", r.status === 400, JSON.stringify(r.json));
  const nOrders = Number((await q("SELECT COUNT(*) n FROM orders WHERE company_id=?", [co3]))[0].n);
  check("reddedilen istekler sipariş oluşturmadı", nOrders === 1, String(nOrders));
  const page = (slug, cookie) => fetch(`${B}/sirket/kontenjan-al/program/${slug}`, { headers: { cookie }, redirect: "manual" });
  let pr = await page(await slugOf(sellable), ac3);
  const html = await pr.text();
  check("kontenjan satın alma sayfası şirket adminine açılır, program adını ve başlığı gösterir", pr.status === 200 && html.includes("Program kontenjanı satın al") && html.includes("E2E Program 21"), String(pr.status));
  pr = await page(await slugOf(draft), ac3);
  check("yayında olmayan / ücretsiz program sayfası 404", pr.status === 404 && (await page(await slugOf(free), ac3)).status === 404, String(pr.status));
  pr = await page(await slugOf(sellable), mc3);
  check("üyeye (admin değil) sayfa açılmaz", pr.status !== 200, String(pr.status));

  // ── E. Ana admin: program kontenjanı tanımı ─────────────────────────────────
  const alloc = (cookie, cid, body) => api(`/api/company/${cid}/allocations`, { cookie, body });
  const pgE = await addProgram(31, [s1, s2]);
  const coE = await addCompany(5);
  const admE = await addUser("admE"); await addMember(coE, admE, { role: "admin" });
  const aE = await cookieFor(emailOf("admE")), memE = await addUser("memE"); await addMember(coE, memE);
  r = await alloc(plat, coE, { program_id: pgE, delta: 5 });
  check("ana admin program_id ile +5 → 200, toplam 5, source=admin", r.status === 200 && (await sum(coE, pgE)).total === 5 && (await q("SELECT source FROM company_program_allocations WHERE company_id=? AND program_id=?", [coE, pgE]))[0].source === "admin", JSON.stringify(r.json));
  r = await alloc(aE, coE, { program_id: pgE, delta: 5 });
  check("şirket admini program kontenjanı tanımlayamaz (403)", r.status === 403 && (await sum(coE, pgE)).total === 5, JSON.stringify(r.json));
  r = await alloc(plat, coE, { program_id: pgE, course_id: s1, delta: 1 });
  check("course_id ve program_id birlikte 400", r.status === 400 && (await sum(coE, pgE)).total === 5, JSON.stringify(r.json));
  r = await alloc(plat, coE, { delta: 1 });
  check("ikisi de yoksa 400", r.status === 400, JSON.stringify(r.json));
  await assignProgramSeat({ companyId: coE, programId: pgE, userId: memE, assignedBy: admE });
  r = await alloc(plat, coE, { program_id: pgE, delta: -5 });
  check("atanan altına düşüren negatif delta 409, toplam değişmez", r.status === 409 && (await sum(coE, pgE)).total === 5, JSON.stringify(r.json));
  r = await alloc(plat, coE, { program_id: pgE, delta: -4 });
  check("kullanılana (1) kadar azaltma 200, toplam 1", r.status === 200 && (await sum(coE, pgE)).total === 1, JSON.stringify(r.json));
  r = await alloc(plat, coE, { program_id: pgE, delta: 0 });
  check("delta 0 → 400", r.status === 400, JSON.stringify(r.json));
  r = await alloc(plat, coE, { program_id: 999999999, delta: 1 });
  check("olmayan program 400 'Program bulunamadı.'", r.status === 400 && /Program bulunamadı/.test(r.json?.message ?? ""), JSON.stringify(r.json));
  r = await alloc(plat, coE, { course_id: s1, delta: 2 });
  check("kurs dalı eskisi gibi çalışır (200)", r.status === 200 && (await q("SELECT COALESCE(SUM(quantity),0) t FROM company_allocations WHERE company_id=? AND course_id=?", [coE, s1]))[0].t == 2, JSON.stringify(r.json));

  // ── F. Toplu atama ──────────────────────────────────────────────────────────
  const bulk = (cookie, cid, items, extra = {}) => api(`/api/company/${cid}/assignments/bulk`, { cookie, body: { items, ...extra } });
  const cItem = (u, c) => ({ user_id: u, course_id: c }), pItem = (u, p) => ({ user_id: u, program_id: p });
  const kC = await addCourse(41), kD = await addCourse(42), kE = await addCourse(43);
  const pgF = await addProgram(41, [kC, kD]);
  const coF = await addCompany(6);
  const admF = await addUser("admF"); await addMember(coF, admF, { role: "admin" });
  const fu = []; for (const n of ["f1", "f2", "f3", "f4", "f5", "f6", "f7"]) { const u = await addUser(n); await addMember(coF, u); fu.push(u); }
  const aF = await cookieFor(emailOf("admF"));
  await addAllocation({ companyId: coF, courseId: kC, delta: 10, source: "admin", createdBy: admF });
  await addProgramAllocation({ companyId: coF, programId: pgF, delta: 10, source: "admin", createdBy: admF });
  const cAsg = async (u, c) => (await q("SELECT status, due_at FROM company_assignments WHERE company_id=? AND user_id=? AND course_id=?", [coF, u, c]))[0];
  const pAsg = async (u, p) => (await q("SELECT status FROM company_program_assignments WHERE company_id=? AND user_id=? AND program_id=?", [coF, u, p]))[0];

  // F1. 3 çalışan × (1 kurs + 1 program) tek istekte
  r = await bulk(aF, coF, fu.slice(0, 3).flatMap((u) => [cItem(u, kC), pItem(u, pgF)]));
  check("toplu atama: 6 kutucuk tek istekte → assigned 6, failed boş", r.status === 200 && r.json?.assigned === 6 && Array.isArray(r.json?.failed) && r.json.failed.length === 0, JSON.stringify(r.json));
  check("her kurs ve program ataması yazıldı", (await Promise.all(fu.slice(0, 3).map(async (u) => (await cAsg(u, kC))?.status === "active" && (await pAsg(u, pgF))?.status === "active"))).every(Boolean));
  check("program ataması çalışanın program kurslarına kayıt açtı (kC zaten kurs atamasıyla var, kD yeni)", (await q("SELECT course_id FROM enrollments WHERE user_id=? ORDER BY course_id", [fu[0]])).map((e) => e.course_id).join() === [kC, kD].sort((a, b) => a - b).join());

  // F2. Kontenjan yetmezse kısmi başarı + kutucuk başına Türkçe hata
  await addAllocation({ companyId: coF, courseId: kE, delta: 2, source: "admin", createdBy: admF });
  r = await bulk(aF, coF, fu.slice(0, 3).map((u) => cItem(u, kE)));
  const f2 = r.json?.failed ?? [];
  check("kontenjan 2 iken 3 kişiye toplu kurs → assigned 2, tek no_free + Türkçe mesaj", r.status === 200 && r.json?.assigned === 2 && f2.length === 1 && f2[0].reason === "no_free" && f2[0].course_id === kE && typeof f2[0].message === "string" && f2[0].message.length > 5 && /[a-zçğıöşü]/i.test(f2[0].message), JSON.stringify(r.json));
  r = await bulk(aF, coF, [pItem(fu[3], 99999999)]);
  check("olmayan program kutucuğu hata verir, sunucu çökmez", r.status === 200 && r.json?.assigned === 0 && r.json?.failed?.length === 1, JSON.stringify(r.json));

  // F3. Tekrar eden kutucuk, boş ve çok büyük istek
  r = await bulk(aF, coF, [cItem(fu[3], kC), cItem(fu[3], kC), pItem(fu[3], pgF), pItem(fu[3], pgF)]);
  check("aynı kutucuk iki kez → tek atama, hata yok", r.status === 200 && r.json?.assigned === 2 && r.json?.failed.length === 0 && (await q("SELECT COUNT(*) n FROM company_assignments WHERE company_id=? AND user_id=? AND course_id=?", [coF, fu[3], kC]))[0].n === 1, JSON.stringify(r.json));
  r = await bulk(aF, coF, []);
  check("boş items 400", r.status === 400, JSON.stringify(r.json));
  r = await bulk(aF, coF, Array.from({ length: 501 }, (_, i) => cItem(fu[0], 1 + i)));
  check("501 kutucuk 400", r.status === 400, JSON.stringify(r.json));
  r = await bulk(aF, coF, [{ user_id: fu[0] }]);
  check("kurs/program belirtmeyen kutucuk 400", r.status === 400, JSON.stringify(r.json));
  r = await bulk(aF, coF, [{ user_id: fu[0], course_id: kC, program_id: pgF }]);
  check("hem kurs hem program belirten kutucuk 400", r.status === 400, JSON.stringify(r.json));
  r = await bulk("", coF, [cItem(fu[0], kC)]);
  check("oturumsuz 401", r.status === 401, JSON.stringify(r.json));

  // F4. BOLA: başka şirketin üyesi
  const coG = await addCompany(7); const gU = await addUser("gU"); await addMember(coG, gU); const gAdm = await addUser("gAdm"); await addMember(coG, gAdm, { role: "admin" });
  const aG = await cookieFor(emailOf("gAdm"));
  r = await bulk(aF, coF, [cItem(gU, kC), pItem(gU, pgF)]);
  check("başka şirketin üyesinin user_id'si → iki kutucuk da not_member", r.status === 200 && r.json?.assigned === 0 && r.json?.failed.length === 2 && r.json.failed.every((f) => f.reason === "not_member"), JSON.stringify(r.json));
  check("hiçbir şirkette satır oluşmadı (A'da da B'de de)", (await q("SELECT COUNT(*) n FROM company_assignments WHERE user_id=?", [gU]))[0].n === 0 && (await q("SELECT COUNT(*) n FROM company_program_assignments WHERE user_id=?", [gU]))[0].n === 0 && (await q("SELECT COUNT(*) n FROM enrollments WHERE user_id=?", [gU]))[0].n === 0);
  r = await bulk(aF, coG, [cItem(gU, kC)]);
  check("başka şirketin yolundan toplu atama 403", r.status === 403 && (await q("SELECT COUNT(*) n FROM company_assignments WHERE user_id=?", [gU]))[0].n === 0, JSON.stringify(r.json));
  void aG;

  // F5. Son kontenjan için eş zamanlı iki toplu istek
  const kLast = await addCourse(44);
  await addAllocation({ companyId: coF, courseId: kLast, delta: 1, source: "admin", createdBy: admF });
  const [ra, rb] = await Promise.all([bulk(aF, coF, [cItem(fu[4], kLast)]), bulk(aF, coF, [cItem(fu[5], kLast)])]);
  const okCount = (ra.json?.assigned ?? 0) + (rb.json?.assigned ?? 0);
  const noFree = [...(ra.json?.failed ?? []), ...(rb.json?.failed ?? [])].filter((f) => f.reason === "no_free").length;
  check("son kontenjana eş zamanlı iki toplu istek → toplam tam 1 atama, öbürü no_free", okCount === 1 && noFree === 1 && (await q("SELECT COUNT(*) n FROM company_assignments WHERE company_id=? AND course_id=? AND status='active'", [coF, kLast]))[0].n === 1, JSON.stringify([ra.json, rb.json]));

  // F6. due_at yalnızca kurs kutucuklarına uygulanır
  r = await bulk(aF, coF, [cItem(fu[6], kC), pItem(fu[6], pgF)], { due_at: "2099-01-01T10:00" });
  const dc = await cAsg(fu[6], kC);
  check("due_at: kurs ataması son tarih alır (program kutucuğu etkilenmez, atama başarılı)", r.status === 200 && r.json?.assigned === 2 && dc?.due_at && (await pAsg(fu[6], pgF))?.status === "active", JSON.stringify(r.json));
  const gu2 = await addUser("f8"); await addMember(coF, gu2);
  r = await bulk(aF, coF, [cItem(gu2, kC)], { due_at: "2001-01-01T10:00" });
  check("geçmiş tarih 400 (DUE_PAST_MESSAGE), hiçbir atama yazılmaz", r.status === 400 && /geçmişte/.test(r.json?.message ?? "") && !(await cAsg(gu2, kC)), JSON.stringify(r.json));
  r = await bulk(aF, coF, [cItem(gu2, kC)], { due_at: "yarın" });
  check("biçimsiz tarih 400", r.status === 400 && !(await cAsg(gu2, kC)), JSON.stringify(r.json));

  // ── G. Panel/matris verisi ──────────────────────────────────────────────────
  await db.query("INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'purchase')", [fu[3], kE]); // fu[3]: kE'ye başka yoldan sahip
  const burnId = (await q("SELECT id FROM company_assignments WHERE company_id=? AND user_id=? AND course_id=?", [coF, fu[6], kC]))[0].id;
  await db.query("UPDATE company_assignments SET status='burned' WHERE id=?", [burnId]);
  const panel = await getCompanyPanelData(coF);
  const cols = panel.matrix.columns, cell = (u, key) => panel.matrix.cells[cellKey(u, key)];
  const keys = cols.map((c) => c.key);
  check("matris sütunları: kontenjanı olan kurslar önce, programlar sonra", keys.slice(0, -1).every((k) => k.startsWith("c:")) && keys.at(-1) === `p:${pgF}` && keys.includes(`c:${kC}`) && keys.includes(`c:${kE}`) && keys.includes(`c:${kLast}`), keys.join());
  check("sütundaki boş sayısı kontenjan özetiyle aynı", cols.find((c) => c.key === `c:${kE}`).free === 0 && cols.find((c) => c.key === `p:${pgF}`).free === panel.programSeats.find((p) => p.programId === pgF).free);
  check("hücre: aktif atama → assigned (kurs ve program)", cell(fu[0], `c:${kC}`) === "assigned" && cell(fu[0], `p:${pgF}`) === "assigned");
  check("hücre: yanan atama → burned", cell(fu[6], `c:${kC}`) === "burned");
  check("hücre: başka yoldan sahip → owned", cell(fu[3], `c:${kE}`) === "owned");
  check("hücre: atama yoksa kayıt yok (açık)", cell(fu[4], `c:${kC}`) === undefined && cell(fu[4], `p:${pgF}`) === undefined);
  check("matris yalnızca bu şirketin üyelerini içerir (başka şirketin üyesi yok)", Object.keys(panel.matrix.cells).every((k) => !k.startsWith(`${gU}:`)));
  check("programSeats özeti ve satın alınabilir programlar (yalnızca satılabilir+ücretli)", panel.programSeats.some((p) => p.programId === pgF && p.total === 10) && Array.isArray(panel.programs) && panel.programs.some((p) => p.id === sellable) && panel.programs.every((p) => p.id !== free && p.id !== draft && p.id !== noCourse));
  const pp = panel.programProgress.find((x) => x.userId === fu[0] && x.programId === pgF);
  check("programProgress: aktif program ataması, 2 kurs, başlamadı, sertifika yok", !!pp && pp.totalCourses === 2 && pp.completedCourses === 0 && pp.status === "not_started" && pp.certificateCode === null && pp.userName.startsWith("E2E"), JSON.stringify(pp));
  await db.query("INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)", [fu[0], lessonOf[kC]]);
  check("programProgress: tamamlanmış ders varsa devam ediyor", (await getCompanyPanelData(coF)).programProgress.find((x) => x.userId === fu[0] && x.programId === pgF)?.status === "in_progress");
  check("programProgress yalnızca aktif atamaları içerir (yanan/geri alınan yok)", panel.programProgress.every((x) => x.programId === pgF) && !panel.programProgress.some((x) => x.userId === gU));
} catch (err) {
  failN++;
  console.error("✗ beklenmeyen hata:", err);
} finally {
  // Temizlik: sıra FK'lara göre (kullanıcı/şirket silinince atama, üyelik, kayıtlar cascade ile gider).
  if (created.users.length) await db.query("DELETE FROM users WHERE id IN (?)", [created.users]);
  if (created.companies.length) await db.query("DELETE FROM companies WHERE id IN (?)", [created.companies]);
  if (created.programs.length) await db.query("DELETE FROM programs WHERE id IN (?)", [created.programs]);
  if (created.courses.length) await db.query("DELETE FROM courses WHERE id IN (?)", [created.courses]);
  const left = (await q("SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c, (SELECT COUNT(*) FROM programs WHERE slug LIKE ?) p, (SELECT COUNT(*) FROM companies WHERE name LIKE ?) co", [`${P}%`, `${P}%`, `${P}%`, `%${P}%`]))[0];
  console.log(`temizlik: kalan kullanıcı=${left.u}, kurs=${left.c}, program=${left.p}, şirket=${left.co}`);
  await db.end();
  console.log(`\n${pass} geçti, ${failN} başarısız`);
  process.exit(failN ? 1 : 0);
}

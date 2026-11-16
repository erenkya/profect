import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
// İade süreci için uçtan uca test (çalışan sunucu + gerçek DB). Kendi kullanıcılarını/kurslarını/siparişlerini oluşturur,
// sonunda hepsini siler (e-postalar @example.invalid, kurs slug'ı e2e-refund-*, şirket kodu E2ER-*).
// Kullanım:  npm run dev   →   npm run test:refunds     (MAIL_DRY_RUN=true önerilir; aksi halde mailler gerçekten denenir)
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
const PW = "Gecici-Sifre-4821!";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };

const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306) });
const stamp = Date.now();
const mail = (n) => `e2e-refund-${stamp}-${n}@example.invalid`;

async function api(path, { method = "POST", body, cookie = "" } = {}) {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let json = null; try { json = await res.json(); } catch {}
  const auth = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("profect_auth_token="))?.split(";")[0] ?? "";
  return { status: res.status, json, auth };
}
const addUser = async (email, { role = "user" } = {}) => {
  const [r] = await db.query("INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at, kvkk_consent_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())", ["E2E " + email.split("-").pop().split("@")[0], email, await bcrypt.hash(PW, 10), role]);
  return r.insertId;
};
const cookieFor = async (email) => {
  const r = await api("/api/auth/login", { body: { email, password: PW, turnstileToken: T } });
  if (!r.auth) throw new Error(`giriş başarısız ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return r.auth;
};

let seq = 0;
/** Kurs + modül + ders. { courseId, lessonId } döner. */
async function addCourse(label = "k") {
  const n = ++seq;
  const [c] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 100, 1)", [`e2e-refund-${stamp}-${label}${n}`, `E2ER-${stamp}-${n}`.slice(0, 30), `E2E İade Kursu ${label}${n}`]);
  const [m] = await db.query("INSERT INTO modules (course_id, title, sort_order) VALUES (?, 'M1', 1)", [c.insertId]);
  const [l] = await db.query("INSERT INTO lessons (module_id, title, lesson_type, content, sort_order) VALUES (?, 'D1', 'video', 'x', 1)", [m.insertId]);
  return { courseId: c.insertId, lessonId: l.insertId };
}
/** Program + verilen kurslar. programId döner. */
async function addProgram(courseIds, label = "p") {
  const n = ++seq;
  const [p] = await db.query("INSERT INTO programs (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 150, 1)", [`e2e-refund-${stamp}-${label}${n}`, `E2RP-${stamp}-${n}`.slice(0, 30), `E2E İade Programı ${n}`]);
  let i = 0;
  for (const cid of courseIds) await db.query("INSERT INTO program_courses (program_id, course_id, sort_order) VALUES (?, ?, ?)", [p.insertId, cid, ++i]);
  return p.insertId;
}
/**
 * Ödenmiş sipariş (+ kalemler + purchase kaydı). items: [{ type: "course", courseId }].
 * paidAgoDays: ödeme tarihi; null ise paid_at NULL ve created_at paidAgoCreated gün önce.
 */
async function addPaidOrder(userId, items, { paidAgoDays = 1, amount = 100, provider = "manual", companyId = null, plan = "cart" } = {}) {
  const paidAt = paidAgoDays === null ? "NULL" : `DATE_SUB(NOW(), INTERVAL ${Number(paidAgoDays)} DAY)`;
  const createdAt = `DATE_SUB(NOW(), INTERVAL ${paidAgoDays === null ? 1 : Number(paidAgoDays)} DAY)`;
  const [o] = await db.query(`INSERT INTO orders (user_id, plan, amount, status, provider, company_id, created_at, paid_at) VALUES (?, ?, ?, 'paid', ?, ?, ${createdAt}, ${paidAt})`, [userId, plan, amount, provider, companyId]);
  for (const it of items) {
    await db.query("INSERT INTO order_items (order_id, item_type, course_id, program_id, title, unit_price, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)", [o.insertId, it.type, it.courseId ?? null, it.programId ?? null, "E2E kalem", amount, it.quantity ?? 1]);
    if (it.type === "course") await db.query("INSERT IGNORE INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'purchase')", [userId, it.courseId]);
    if (it.type === "program") {
      await db.query("INSERT IGNORE INTO program_enrollments (user_id, program_id, source) VALUES (?, ?, 'purchase')", [userId, it.programId]);
      await db.query("INSERT IGNORE INTO enrollments (user_id, course_id, status, source) SELECT ?, course_id, 'active', 'purchase' FROM program_courses WHERE program_id = ?", [userId, it.programId]);
    }
  }
  return o.insertId;
}
const pageHtml = async (path, cookie = "") => { const res = await fetch(B + path, { headers: { cookie }, redirect: "manual" }); return { status: res.status, text: res.status === 200 ? await res.text() : "" }; };
const refund = (cookie, orderId, reason) => api(`/api/orders/${orderId}/refund`, { cookie, body: reason === undefined ? {} : { reason } });
const request = async (orderId) => (await db.query("SELECT * FROM refund_requests WHERE order_id=?", [orderId]))[0][0];
const order = async (orderId) => (await db.query("SELECT * FROM orders WHERE id=?", [orderId]))[0][0];

try {
  const [[tbl]] = await db.query("SHOW TABLES LIKE 'refund_requests'"); if (!tbl) throw new Error("refund_requests tablosu yok: önce npm run db:migrate");
  const U = mail("buyer"), O = mail("other"), ADM = mail("admin");
  const uId = await addUser(U), oId = await addUser(O);
  await addUser(ADM, { role: "admin" });
  const uCookie = await cookieFor(U), oCookie = await cookieFor(O), admCookie = await cookieFor(ADM);

  // ── Başvuru ──────────────────────────────────────────────────────────────────
  {
    const a = await addCourse("uygun");
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }]);
    let r = await refund(uCookie, id, "Fikrim değişti");
    check("uygun sipariş başvurusu 201", r.status === 201, JSON.stringify(r.json));
    const req = await request(id);
    check("DB: başvuru requested, tutar 100.00, gerekçe kayıtlı", req?.status === "requested" && req.amount === "100.00" && req.reason === "Fikrim değişti", JSON.stringify(req));
    r = await refund(uCookie, id);
    check("ikinci başvuru 409 request_exists", r.status === 409 && r.json.blocks?.includes("request_exists"), JSON.stringify(r.json));
  }
  {
    const a = await addCourse("gec");
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }], { paidAgoDays: 15 });
    const r = await refund(uCookie, id);
    check("15 günlük sipariş 409 window_expired", r.status === 409 && r.json.blocks?.includes("window_expired"), JSON.stringify(r.json));
  }
  {
    const a = await addCourse("basladi");
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }]);
    await db.query("INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)", [uId, a.lessonId]);
    const r = await refund(uCookie, id);
    check("satın alımdan sonra ders tamamlandıysa 409 already_started", r.status === 409 && r.json.blocks?.includes("already_started"), JSON.stringify(r.json));
  }
  {
    const a = await addCourse("onizleme");
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }]);
    await db.query("INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, DATE_SUB(NOW(), INTERVAL 2 DAY))", [uId, a.lessonId]);
    await db.query("INSERT INTO video_stream_usage (user_id, lesson_id, day, bytes) VALUES (?, ?, DATE_SUB(CURDATE(), INTERVAL 2 DAY), ?)", [uId, a.lessonId, 5 * 1024 * 1024]);
    const r = await refund(uCookie, id);
    check("satın alımdan ÖNCE izlenen önizleme iadeyi engellemez (201)", r.status === 201, JSON.stringify(r.json));
  }
  {
    const a = await addCourse("eskitarih");
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }], { paidAgoDays: null });
    const r = await refund(uCookie, id);
    check("paid_at boş eski sipariş created_at'e düşer (201)", r.status === 201, JSON.stringify(r.json));
  }
  {
    const a = await addCourse("yetki");
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }]);
    let r = await refund(oCookie, id);
    check("başkasının siparişi 404", r.status === 404, JSON.stringify(r.json));
    check("başkasının siparişine başvuru satırı açılmadı", !(await request(id)));
    r = await refund("", id);
    check("oturumsuz 401", r.status === 401);
    r = await refund(uCookie, 99999999);
    check("olmayan sipariş 404", r.status === 404);
  }
  {
    const a = await addCourse("hediye1");
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }]);
    await db.query("INSERT INTO gifts (order_id, sender_id, course_id, recipient_email, status) VALUES (?, ?, ?, ?, 'claimed')", [id, uId, a.courseId, mail("alici1")]);
    let r = await refund(uCookie, id);
    check("alınmış hediye 409 gift_claimed", r.status === 409 && r.json.blocks?.includes("gift_claimed"), JSON.stringify(r.json));
    const b = await addCourse("hediye2");
    const id2 = await addPaidOrder(uId, [{ type: "course", courseId: b.courseId }]);
    await db.query("INSERT INTO gifts (order_id, sender_id, course_id, recipient_email, status) VALUES (?, ?, ?, ?, 'pending')", [id2, uId, b.courseId, mail("alici2")]);
    r = await refund(uCookie, id2);
    check("alınmamış (pending) hediye 201", r.status === 201, JSON.stringify(r.json));
  }
  {
    const a = await addCourse("kontenjan");
    const [co] = await db.query("INSERT INTO companies (name, code) VALUES (?, ?)", [`E2E Şirket ${stamp}`, `E2ER-${stamp}`.slice(0, 30)]);
    const compId = co.insertId;
    await db.query("INSERT INTO company_members (company_id, user_id, role, status) VALUES (?, ?, 'admin', 'active')", [compId, uId]);
    const seatsOrder = async (qty) => {
      const id = await addPaidOrder(uId, [{ type: "seats", courseId: a.courseId, quantity: qty }], { companyId: compId });
      await db.query("INSERT INTO company_allocations (company_id, course_id, quantity, source, order_id) VALUES (?, ?, ?, 'purchase', ?)", [compId, a.courseId, qty, id]);
      return id;
    };
    const idA = await seatsOrder(1);
    await db.query("INSERT INTO company_assignments (company_id, course_id, user_id, status) VALUES (?, ?, ?, 'active')", [compId, a.courseId, oId]);
    let r = await refund(uCookie, idA);
    check("atanmış kontenjan siparişi 409 seats_assigned", r.status === 409 && r.json.blocks?.includes("seats_assigned"), JSON.stringify(r.json));
    await db.query("DELETE FROM company_assignments WHERE company_id=?", [compId]);
    r = await refund(uCookie, idA);
    check("atama yoksa kontenjan siparişi 201", r.status === 201, JSON.stringify(r.json));
  }

  // ── Karar (onay / red / iade yapıldı) ─────────────────────────────────────────
  const decide = (id, body, cookie = admCookie) => api(`/api/admin/refunds/${id}`, { method: "PATCH", cookie, body });
  /** Kurs siparişi + açık iade başvurusu. { orderId, requestId, ...course } döner. */
  async function openRequest(provider, label = "karar") {
    const c = await addCourse(label);
    const orderId = await addPaidOrder(uId, [{ type: "course", courseId: c.courseId }], { provider });
    const r = await refund(uCookie, orderId);
    if (r.status !== 201) throw new Error("başvuru açılamadı: " + JSON.stringify(r.json));
    return { orderId, requestId: r.json.requestId, ...c };
  }
  {
    const x = await openRequest("manual");
    let r = await decide(x.requestId, { action: "mark_refunded" });
    check("requested iken mark_refunded 409", r.status === 409, JSON.stringify(r.json));
    r = await decide(x.requestId, { action: "approve" });
    check("manual: approve 200, durum approved", r.status === 200 && r.json.status === "approved", JSON.stringify(r.json));
    check("manual: onaydan sonra sipariş hâlâ paid", (await order(x.orderId)).status === "paid");
    r = await decide(x.requestId, { action: "approve" });
    check("manual: ikinci approve 409 (bad_state)", r.status === 409, JSON.stringify(r.json));
    r = await decide(x.requestId, { action: "mark_refunded" });
    check("manual: mark_refunded 200, durum refunded", r.status === 200 && r.json.status === "refunded", JSON.stringify(r.json));
    const o = await order(x.orderId);
    check("manual: sipariş refunded ve refunded_at dolu", o.status === "refunded" && o.refunded_at !== null);
    check("manual: başvuru refunded, decided_by dolu", (await request(x.orderId)).status === "refunded" && (await request(x.orderId)).decided_by !== null);
  }
  {
    const x = await openRequest("mock");
    const r = await decide(x.requestId, { action: "approve" });
    check("mock: approve tek çağrıda refunded", r.status === 200 && r.json.status === "refunded", JSON.stringify(r.json));
    const req = await request(x.orderId);
    check("mock: provider_ref = mock-refund-<id>", req.provider_ref === `mock-refund-${x.requestId}`, req.provider_ref);
    check("mock: mark_refunded otomatik sağlayıcıda 409", (await decide(x.requestId, { action: "mark_refunded" })).status === 409);
  }
  {
    const x = await openRequest("tami");
    let r = await decide(x.requestId, { action: "approve" });
    check("tami: approve 200, durum failed", r.status === 200 && r.json.status === "failed", JSON.stringify(r.json));
    check("tami: error_message dolu, sipariş hâlâ paid", !!(await request(x.orderId)).error_message && (await order(x.orderId)).status === "paid");
    r = await decide(x.requestId, { action: "approve" });
    check("tami: failed yeniden denenebilir (yine failed)", r.status === 200 && r.json.status === "failed", JSON.stringify(r.json));
    r = await decide(x.requestId, { action: "mark_refunded" });
    check("tami: failed iken mark_refunded 409", r.status === 409);
    r = await decide(x.requestId, { action: "reject", note: "Sağlayıcı iadesi yapılamadı" });
    check("tami: failed başvuru reddedilebilir", r.status === 200 && r.json.status === "rejected", JSON.stringify(r.json));
  }
  {
    const x = await openRequest("manual");
    let r = await decide(x.requestId, { action: "reject" });
    check("reject notsuz 400", r.status === 400, JSON.stringify(r.json));
    r = await decide(x.requestId, { action: "reject", note: "Politika dışı" });
    check("reject notlu 200, durum rejected", r.status === 200 && r.json.status === "rejected", JSON.stringify(r.json));
    const req = await request(x.orderId);
    check("reject: karar notu kayıtlı, sipariş paid kalır", req.decision_note === "Politika dışı" && (await order(x.orderId)).status === "paid");
    check("reject sonrası approve 409", (await decide(x.requestId, { action: "approve" })).status === 409);
  }
  {
    const x = await openRequest("mock", "cift");
    const rs = await Promise.all([decide(x.requestId, { action: "approve" }), decide(x.requestId, { action: "approve" })]);
    const codes = rs.map((r) => r.status).sort();
    check("çift onay: biri 200, diğeri 409", codes[0] === 200 && codes[1] === 409, JSON.stringify(rs.map((r) => [r.status, r.json])));
    const [reqs] = await db.query("SELECT status FROM refund_requests WHERE order_id=?", [x.orderId]);
    check("çift onay: tek başvuru satırı, refunded", reqs.length === 1 && reqs[0].status === "refunded");
    const rs2 = await Promise.all([decide(x.requestId, { action: "mark_refunded" }), decide(x.requestId, { action: "mark_refunded" })]);
    check("refunded başvuruda iki mark_refunded de 409", rs2.every((r) => r.status === 409));
  }
  {
    const x = await openRequest("mock", "baslama");
    await db.query("INSERT INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)", [uId, x.lessonId]);
    let r = await decide(x.requestId, { action: "approve" });
    check("başvurudan sonra başlandıysa approve 409 ineligible", r.status === 409 && r.json.blocks?.includes("already_started"), JSON.stringify(r.json));
    r = await decide(x.requestId, { action: "approve", override: true });
    check("notsuz override 400", r.status === 400, JSON.stringify(r.json));
    r = await decide(x.requestId, { action: "approve", override: true, note: "Destek yazışması" });
    check("notlu override 200, refunded", r.status === 200 && r.json.status === "refunded", JSON.stringify(r.json));
    const req = await request(x.orderId);
    check("override kaydı: override=1, not yazıldı", req.override === 1 && req.decision_note === "Destek yazışması");
  }
  {
    const x = await openRequest("mock", "hediyeoverride");
    await db.query("INSERT INTO gifts (order_id, sender_id, course_id, recipient_email, status) VALUES (?, ?, ?, ?, 'claimed')", [x.orderId, uId, x.courseId, mail("alici3")]);
    const r = await decide(x.requestId, { action: "approve", override: true, note: "Zorla" });
    check("alınmış hediye override ile de aşılamaz (409)", r.status === 409 && r.json.blocks?.includes("gift_claimed"), JSON.stringify(r.json));
  }
  {
    const x = await openRequest("manual", "yetki");
    const r = await decide(x.requestId, { action: "approve" }, uCookie);
    check("admin olmayan 403", r.status === 403);
    check("olmayan başvuru 404", (await decide(99999999, { action: "approve" })).status === 404);
  }
  {
    // İade edilmiş sipariş, admin "onayla" API'siyle yeniden ödendi sayılıp erişimi yeniden açmamalı.
    const x = await openRequest("mock", "yenidenacma");
    await decide(x.requestId, { action: "approve" });
    await db.query("DELETE FROM enrollments WHERE user_id=? AND course_id=?", [uId, x.courseId]);
    const r = await api(`/api/admin/orders/${x.orderId}`, { method: "PATCH", cookie: admCookie, body: { action: "approve" } });
    check("refunded siparişe admin 'onayla' 200 dönmez", r.status !== 200, JSON.stringify(r.json));
    const [[e]] = await db.query("SELECT COUNT(*) n FROM enrollments WHERE user_id=? AND course_id=?", [uId, x.courseId]);
    check("refunded sipariş erişimi yeniden açmadı, durum refunded", e.n === 0 && (await order(x.orderId)).status === "refunded");
  }

  // ── Etkiler (erişim, hediye, kontenjan, kupon) ────────────────────────────────
  /** Verilen siparişe başvurur ve mock ile onaylar (iade hemen sonuçlanır). */
  async function refundNow(orderId) {
    const r = await refund(uCookie, orderId);
    if (r.status !== 201) throw new Error("başvuru açılamadı: " + JSON.stringify(r.json));
    const d = await decide(r.json.requestId, { action: "approve" });
    if (d.status !== 200 || d.json.status !== "refunded") throw new Error("iade sonuçlanmadı: " + JSON.stringify(d.json));
    return r.json.requestId;
  }
  const enr = async (userId, courseId) => (await db.query("SELECT source FROM enrollments WHERE user_id=? AND course_id=?", [userId, courseId]))[0][0];
  {
    const a = await addCourse("erisim");
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }], { provider: "mock" });
    check("iade öncesi kurs erişimi var", (await enr(uId, a.courseId))?.source === "purchase");
    await refundNow(id);
    check("kurs iadesi: purchase kaydı silindi", !(await enr(uId, a.courseId)));
  }
  {
    const a = await addCourse("admin");
    await db.query("INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'admin')", [uId, a.courseId]);
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }], { provider: "mock" }); // INSERT IGNORE: admin kaydı kalır
    await refundNow(id);
    check("admin kaynaklı kurs erişimi iade yüzünden silinmedi", (await enr(uId, a.courseId))?.source === "admin");
  }
  {
    const a = await addCourse("ikisiparis");
    const id1 = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }], { provider: "mock", paidAgoDays: 3 });
    await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }], { provider: "mock", paidAgoDays: 2 });
    await refundNow(id1);
    check("aynı kursu karşılayan başka ödenmiş sipariş varsa erişim kalır", (await enr(uId, a.courseId))?.source === "purchase");
  }
  {
    const c1 = await addCourse("prog1"), c2 = await addCourse("prog2");
    const prog = await addProgram([c1.courseId, c2.courseId]);
    await db.query("INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'gift')", [uId, c2.courseId]); // c2'ye ayrıca hediyeyle sahip
    const id = await addPaidOrder(uId, [{ type: "program", programId: prog }], { provider: "mock" });
    await refundNow(id);
    const [pe] = await db.query("SELECT 1 FROM program_enrollments WHERE user_id=? AND program_id=?", [uId, prog]);
    check("program iadesi: program üyeliği silindi", pe.length === 0);
    check("program iadesi: purchase kaynaklı kurs kaydı silindi", !(await enr(uId, c1.courseId)));
    check("program iadesi: hediyeyle gelen kurs kaydı kaldı", (await enr(uId, c2.courseId))?.source === "gift");
  }
  {
    const a = await addCourse("hediyeiptal");
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }], { provider: "mock" });
    await db.query("INSERT INTO gifts (order_id, sender_id, course_id, recipient_email, status, token_hash) VALUES (?, ?, ?, ?, 'pending', ?)", [id, uId, a.courseId, mail("alici4"), "a".repeat(64)]);
    await refundNow(id);
    const [[g]] = await db.query("SELECT status, token_hash FROM gifts WHERE order_id=?", [id]);
    check("hediye iadesi: gifts.status cancelled, token_hash NULL", g.status === "cancelled" && g.token_hash === null, JSON.stringify(g));
  }
  {
    const a = await addCourse("kontenjan2");
    const [co] = await db.query("INSERT INTO companies (name, code) VALUES (?, ?)", [`E2E Şirket2 ${stamp}`, `E2ER-${stamp}-2`.slice(0, 30)]);
    const id = await addPaidOrder(uId, [{ type: "seats", courseId: a.courseId, quantity: 3 }], { provider: "mock", companyId: co.insertId });
    await db.query("INSERT INTO company_allocations (company_id, course_id, quantity, source, order_id) VALUES (?, ?, 3, 'purchase', ?)", [co.insertId, a.courseId, id]);
    await refundNow(id);
    const [[t]] = await db.query("SELECT COALESCE(SUM(quantity),0) AS total FROM company_allocations WHERE company_id=? AND course_id=?", [co.insertId, a.courseId]);
    check("kontenjan iadesi: şirket toplamı düştü", Number(t.total) === 0, JSON.stringify(t));
  }
  {
    const a = await addCourse("pkontenjan");
    const prog = await addProgram([a.courseId]);
    const [co] = await db.query("INSERT INTO companies (name, code) VALUES (?, ?)", [`E2E Şirket3 ${stamp}`, `E2ER-${stamp}-3`.slice(0, 30)]);
    const id = await addPaidOrder(uId, [{ type: "program_seats", programId: prog, quantity: 2 }], { provider: "mock", companyId: co.insertId });
    await db.query("INSERT INTO company_program_allocations (company_id, program_id, quantity, source, order_id) VALUES (?, ?, 2, 'purchase', ?)", [co.insertId, prog, id]);
    await refundNow(id);
    const [[t]] = await db.query("SELECT COALESCE(SUM(quantity),0) AS total FROM company_program_allocations WHERE company_id=? AND program_id=?", [co.insertId, prog]);
    check("program kontenjanı iadesi: şirket toplamı düştü", Number(t.total) === 0, JSON.stringify(t));
  }
  {
    const a = await addCourse("kupon");
    const code = `E2ER${stamp}K`;
    const [cp] = await db.query("INSERT INTO coupons (code, discount_type, discount_value, is_active) VALUES (?, 'fixed', 10, 1)", [code]);
    const id = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }], { provider: "mock", amount: 90 });
    await db.query("UPDATE orders SET coupon_id=?, coupon_code=?, discount_amount=10 WHERE id=?", [cp.insertId, code, id]);
    await db.query("INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, discount_amount) VALUES (?, ?, ?, 10)", [cp.insertId, uId, id]);
    await refundNow(id);
    const [red] = await db.query("SELECT 1 FROM coupon_redemptions WHERE order_id=?", [id]);
    check("kupon iadesi: coupon_redemptions satırı silindi (kupon tekrar kullanılabilir)", red.length === 0);
    check("kupon iadesi: iade tutarı indirim sonrası ödenen (90.00)", (await request(id)).amount === "90.00");
  }

  // ── Kullanıcı arayüzü ve yasal metin (sunucu çıktısı) ─────────────────────────
  {
    const a = await addCourse("ui1"), b = await addCourse("ui2");
    const okId = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }]);
    const lateId = await addPaidOrder(uId, [{ type: "course", courseId: b.courseId }], { paidAgoDays: 15 });
    let p = await pageHtml(`/hesabim/siparislerim/${okId}`, uCookie);
    check("detay: uygun siparişte 'İade talep et' bölümü ve #iade çapası", p.status === 200 && p.text.includes("İade talep et") && p.text.includes('id="iade"'), `status=${p.status}`);
    p = await pageHtml(`/hesabim/siparislerim/${lateId}`, uCookie);
    check("detay: 15 günlük siparişte bölüm nedeni gösterir (gizlenmez)", p.status === 200 && p.text.includes("günden fazla geçtiği için iade yapılamaz"));
    p = await pageHtml("/hesabim/siparislerim", uCookie);
    check("liste: uygun siparişte iade bağlantısı var", p.text.includes(`/hesabim/siparislerim/${okId}#iade`));
    check("liste: 15 günlük siparişte iade bağlantısı yok", !p.text.includes(`/hesabim/siparislerim/${lateId}#iade`));
    await refund(uCookie, okId, "UI testi");
    p = await pageHtml(`/hesabim/siparislerim/${okId}`, uCookie);
    check("detay: başvuru sonrası 'İade talebiniz inceleniyor' durumu", p.text.includes("İade talebiniz inceleniyor"));
    p = await pageHtml(`/hesabim/siparislerim/${okId}`, oCookie);
    check("detay: başkasının siparişi sayfası 404", p.status === 404);
    p = await pageHtml("/iade-ve-iptal");
    check("yasal sayfa: hesaptan başvuru yolunu gösterir", p.status === 200 && p.text.includes("Siparişlerim") && p.text.includes("/hesabim/siparislerim"));
  }

  // ── Admin arayüzü (sunucu çıktısı) ────────────────────────────────────────────
  {
    const a = await addCourse("adm1"), b = await addCourse("adm2");
    const note = `ADMIN-UI-${stamp}`;
    const openId = await addPaidOrder(uId, [{ type: "course", courseId: a.courseId }], { provider: "manual" });
    await refund(uCookie, openId, note);
    const doneId = await addPaidOrder(uId, [{ type: "course", courseId: b.courseId }], { provider: "mock" });
    await refundNow(doneId);
    let p = await pageHtml("/admin/iadeler", admCookie);
    check("admin: /admin/iadeler açık başvuruyu gerekçesiyle listeler", p.status === 200 && p.text.includes(note), `status=${p.status}`);
    check("admin: açık başvuruda Onayla ve Reddet eylemleri var", p.text.includes("Onayla") && p.text.includes("Reddet"));
    p = await pageHtml("/admin/iadeler", uCookie);
    check("admin: normal kullanıcı /admin/iadeler göremez", p.status !== 200);
    p = await pageHtml("/admin/siparisler", admCookie);
    check("admin: siparişler listesinde 'İade edildi' rozeti", p.status === 200 && p.text.includes("İade edildi"));
    check("admin: açık başvurusu olan siparişte 'İade talebi var' bağlantısı", p.text.includes("İade talebi var"));
    p = await pageHtml("/admin", admCookie);
    check("admin: sekmelerde 'İadeler' var", p.text.includes("İadeler"));
  }

  // @@NEXT-SECTIONS@@
} catch (e) {
  failN++; console.error("✗ BEKLENMEYEN HATA", e);
} finally {
  await db.query("DELETE FROM users WHERE email LIKE ?", [`e2e-refund-${stamp}-%@example.invalid`]); // siparişler/başvurular/kayıtlar cascade
  await db.query("DELETE FROM companies WHERE code LIKE ?", [`E2ER-${stamp}%`]);
  await db.query("DELETE FROM programs WHERE slug LIKE ?", [`e2e-refund-${stamp}-%`]);
  await db.query("DELETE FROM courses WHERE slug LIKE ?", [`e2e-refund-${stamp}-%`]);
  await db.query("DELETE FROM coupons WHERE code LIKE ?", [`E2ER${stamp}%`]);
  const [[left]] = await db.query("SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c, (SELECT COUNT(*) FROM companies WHERE code LIKE ?) co", [`e2e-refund-${stamp}-%`, `e2e-refund-${stamp}-%`, `E2ER-${stamp}%`]);
  console.log(`temizlik: kalan test kullanıcısı=${left.u}, kalan test kursu=${left.c}, kalan test şirketi=${left.co}`);
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

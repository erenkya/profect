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
  }
  return o.insertId;
}
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

  // @@NEXT-SECTIONS@@
} catch (e) {
  failN++; console.error("✗ BEKLENMEYEN HATA", e);
} finally {
  await db.query("DELETE FROM users WHERE email LIKE ?", [`e2e-refund-${stamp}-%@example.invalid`]); // siparişler/başvurular/kayıtlar cascade
  await db.query("DELETE FROM companies WHERE code LIKE ?", [`E2ER-${stamp}%`]);
  await db.query("DELETE FROM courses WHERE slug LIKE ?", [`e2e-refund-${stamp}-%`]);
  const [[left]] = await db.query("SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c, (SELECT COUNT(*) FROM companies WHERE code LIKE ?) co", [`e2e-refund-${stamp}-%`, `e2e-refund-${stamp}-%`, `E2ER-${stamp}%`]);
  console.log(`temizlik: kalan test kullanıcısı=${left.u}, kalan test kursu=${left.c}, kalan test şirketi=${left.co}`);
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

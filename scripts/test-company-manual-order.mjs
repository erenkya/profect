import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
// Havaleli şirket kontenjanı → sipariş → iade talebi → elle iade için uçtan uca test (çalışan sunucu + gerçek DB).
// Kendi kullanıcılarını, kursunu ve şirketini oluşturur, sonunda hepsini siler (ad öneki e2e-cmo-<damga>).
// Kullanım:  npm run dev   →   npm run test:company-manual-order     (MAIL_DRY_RUN=true önerilir)
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
const PW = "Gecici-Sifre-4821!";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };

const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306) });
const stamp = Date.now();
const P = `e2e-cmo-${stamp}`;
const created = { users: [], companies: [], courses: [] };
const q = async (sql, p) => (await db.query(sql, p))[0];

async function api(path, { method = "POST", body, cookie = "" } = {}) {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let json = null; try { json = await res.json(); } catch {}
  const auth = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("profect_auth_token="))?.split(";")[0] ?? "";
  return { status: res.status, json, auth };
}
const HASH = await bcrypt.hash(PW, 10);
const emailOf = (n) => `${P}-${n}@example.invalid`;
const addUser = async (n, role = "user") => { const [r] = await db.query("INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at, kvkk_consent_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())", [`E2E ${n}`, emailOf(n), HASH, role]); created.users.push(r.insertId); return r.insertId; };
const cookieFor = async (n) => { const r = await api("/api/auth/login", { body: { email: emailOf(n), password: PW, turnstileToken: T } }); if (!r.auth) throw new Error(`giriş başarısız ${n}: ${r.status} ${JSON.stringify(r.json)}`); return r.auth; };
const addCourse = async (n) => { const [r] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 100, 1)", [`${P}-c${n}`, `E2M${n}-${stamp}`.slice(0, 30), `E2E Kurs ${n}`]); created.courses.push(r.insertId); return r.insertId; };
const addCompany = async (n) => { const [r] = await db.query("INSERT INTO companies (name, code, tax_office, tax_number) VALUES (?, ?, 'Test VD', '1234567890')", [`E2E ${P} ${n}`, `CMO${n}-${String(stamp).slice(-4)}`.slice(0, 12).replace(/[^A-Z0-9-]/gi, "X")]); created.companies.push(r.insertId); return r.insertId; };
const addMember = (companyId, userId, role = "member") => db.query("INSERT INTO company_members (company_id, user_id, role, status, approved_at) VALUES (?, ?, ?, 'active', NOW())", [companyId, userId, role]);

try {
  const platform = await addUser("platform", "admin");
  const owner = await addUser("owner"), other = await addUser("other"), emp = await addUser("emp"), stranger = await addUser("stranger");
  const co = await addCompany(1);
  await addMember(co, owner, "admin"); await addMember(co, other, "admin"); await addMember(co, emp);
  const course = await addCourse(1);
  const adm = await cookieFor("platform"), own = await cookieFor("owner"), oth = await cookieFor("other"), str = await cookieFor("stranger");
  const alloc = (cookie, body) => api(`/api/company/${co}/allocations`, { cookie, body });
  const seats = async () => Number((await q("SELECT COALESCE(SUM(quantity),0) t FROM company_allocations WHERE company_id=? AND course_id=?", [co, course]))[0].t);

  // ── A. Havale tutarı → sipariş ─────────────────────────────────────────────
  let r = await alloc(own, { course_id: course, delta: 5, paid_amount: 600 });
  check("şirket admini kontenjan tanımlayamaz (403), tutarla da", r.status === 403, JSON.stringify(r));
  r = await alloc(adm, { course_id: course, delta: -1, paid_amount: 600 });
  check("havale tutarı kontenjan azaltırken reddedilir (400)", r.status === 400, JSON.stringify(r));
  r = await alloc(adm, { course_id: course, delta: 5, paid_amount: 0 });
  check("sıfır tutar reddedilir (400)", r.status === 400, JSON.stringify(r));
  check("reddedilen istekler kontenjan eklemedi", (await seats()) === 0);

  r = await alloc(adm, { course_id: course, delta: 5, paid_amount: 600 });
  check("tutarla kontenjan eklenir (201) ve sipariş no döner", r.status === 201 && Number.isInteger(r.json?.orderId), JSON.stringify(r));
  const orderId = r.json?.orderId;
  const o = (await q("SELECT * FROM orders WHERE id=?", [orderId]))[0];
  check("sipariş: havale, ödendi, şirkete bağlı, KDV dahil tutar", o?.provider === "manual" && o.status === "paid" && Number(o.amount) === 600 && o.company_id === co && o.paid_at, JSON.stringify(o));
  check("sipariş şirketin en eski aktif adminine yazıldı", o?.user_id === owner, `user_id=${o?.user_id}`);
  const it = (await q("SELECT * FROM order_items WHERE order_id=?", [orderId]))[0];
  check("kalem: seats ×5, satır toplamı KDV hariç (600/1,2 = 500)", it?.item_type === "seats" && it.quantity === 5 && Number(it.unit_price) === 500, JSON.stringify(it));
  const al = (await q("SELECT * FROM company_allocations WHERE company_id=? AND course_id=?", [co, course]))[0];
  check("kontenjan siparişle geldi (source purchase, order_id dolu)", al?.source === "purchase" && al.order_id === orderId && al.quantity === 5, JSON.stringify(al));

  // Tutarsız ekleme: eskisi gibi, siparişsiz.
  r = await alloc(adm, { course_id: course, delta: 2 });
  check("tutarsız ekleme siparişsiz çalışır (source admin)", r.status === 200 && (await q("SELECT 1 FROM company_allocations WHERE company_id=? AND source='admin' AND order_id IS NULL", [co])).length === 1, JSON.stringify(r));
  check("toplam 7", (await seats()) === 7);

  // ── B. İade talebi: yalnızca siparişi alan yönetici ─────────────────────────
  r = await api(`/api/orders/${orderId}/refund`, { cookie: str, body: { reason: "yabancı" } });
  check("başka kullanıcı iade talebi açamaz (404)", r.status === 404, JSON.stringify(r));
  r = await api(`/api/orders/${orderId}/refund`, { cookie: oth, body: { reason: "diğer yönetici" } });
  check("siparişin sahibi olmayan şirket yöneticisi de açamaz (404, kart siparişleriyle aynı kural)", r.status === 404, JSON.stringify(r));

  // Kontenjanı çalışana ata → iade, toplamı (atanan+yanan) altına indireceği için engellenir.
  const ar = await api(`/api/company/${co}/assignments`, { cookie: own, body: { user_id: emp, course_id: course } });
  check("çalışana atama yapıldı", ar.status === 200, JSON.stringify(ar));
  r = await api(`/api/orders/${orderId}/refund`, { cookie: own, body: {} });
  // 7 toplam − 5 (bu sipariş) = 2 ≥ 1 kullanılan → hâlâ uygun.
  check("kalan kontenjan atananı karşılıyorsa (2 ≥ 1) talep açılır (201)", r.status === 201, JSON.stringify(r));
  const rr = (await q("SELECT * FROM refund_requests WHERE order_id=?", [orderId]))[0];
  check("talep: requested, provider manual, tutar siparişle aynı", rr?.status === "requested" && rr.provider === "manual" && Number(rr.amount) === 600, JSON.stringify(rr));
  r = await api(`/api/orders/${orderId}/refund`, { cookie: own, body: {} });
  check("ikinci talep reddedilir (409 request_exists)", r.status === 409, JSON.stringify(r));

  // ── C. Admin kararı: elle iade, sağlayıcı çağrısı yok ──────────────────────
  r = await api(`/api/admin/refunds/${rr.id}`, { method: "PATCH", cookie: own, body: { action: "approve" } });
  check("yönetici olmayan karar veremez (401/403)", r.status === 401 || r.status === 403, JSON.stringify(r));
  r = await api(`/api/admin/refunds/${rr.id}`, { method: "PATCH", cookie: adm, body: { action: "mark_refunded" } });
  check("onaylanmadan 'İade yapıldı' denemez (409)", r.status === 409, JSON.stringify(r));
  r = await api(`/api/admin/refunds/${rr.id}`, { method: "PATCH", cookie: adm, body: { action: "approve" } });
  check("onay: approved (banka iadesi bekleniyor), Tami çağrısı yok", r.status === 200 && r.json?.status === "approved", JSON.stringify(r));
  const rr2 = (await q("SELECT status, provider_ref FROM refund_requests WHERE id=?", [rr.id]))[0];
  check("provider_ref boş, sipariş hâlâ ödendi, kontenjan yerinde", rr2.status === "approved" && rr2.provider_ref === null && (await q("SELECT status FROM orders WHERE id=?", [orderId]))[0].status === "paid" && (await seats()) === 7, JSON.stringify(rr2));
  r = await api(`/api/admin/refunds/${rr.id}`, { method: "PATCH", cookie: adm, body: { action: "mark_refunded" } });
  check("'İade yapıldı': 200 refunded", r.status === 200 && r.json?.status === "refunded", JSON.stringify(r));
  check("sipariş refunded, sipariş kontenjanı silindi (7 → 2), admin kontenjanı kaldı", (await q("SELECT status FROM orders WHERE id=?", [orderId]))[0].status === "refunded" && (await seats()) === 2);
  check("atanmış çalışanın erişimi bozulmadı", (await q("SELECT 1 FROM company_assignments WHERE company_id=? AND user_id=? AND status='active'", [co, emp])).length === 1);

  // ── D. Kontenjanı yetmeyen sipariş iade edilemez ────────────────────────────
  r = await alloc(adm, { course_id: course, delta: 1, paid_amount: 120 });
  const order2 = r.json?.orderId;
  check("ikinci havale siparişi açıldı (toplam 3)", r.status === 201 && (await seats()) === 3, JSON.stringify(r));
  const emp2 = await addUser("emp2"), emp3 = await addUser("emp3");
  await addMember(co, emp2); await addMember(co, emp3);
  await api(`/api/company/${co}/assignments`, { cookie: own, body: { user_id: emp2, course_id: course } });
  await api(`/api/company/${co}/assignments`, { cookie: own, body: { user_id: emp3, course_id: course } });
  r = await api(`/api/orders/${order2}/refund`, { cookie: own, body: {} });
  check("atanan kontenjan toplamı aşacaksa talep 409 (seats_assigned)", r.status === 409 && r.json?.blocks?.includes("seats_assigned"), JSON.stringify(r));

  // ── E. Sipariş yoksa talep yok: admin tanımlı hak ──────────────────────────
  const adminAlloc = (await q("SELECT id FROM company_allocations WHERE company_id=? AND order_id IS NULL", [co]))[0];
  check("siparişsiz (admin tanımlı) kontenjanın iade edilecek siparişi yoktur", !!adminAlloc && (await q("SELECT 1 FROM orders WHERE company_id=? AND id NOT IN (?, ?)", [co, orderId, order2])).length === 0);

  // ── F. Şirketin aktif yöneticisi yoksa sipariş açılmaz, kontenjan da eklenmez ─
  const co2 = await addCompany(2);
  await addMember(co2, stranger, "member");
  const before = Number((await q("SELECT COALESCE(SUM(quantity),0) t FROM company_allocations WHERE company_id=?", [co2]))[0].t);
  r = await api(`/api/company/${co2}/allocations`, { cookie: adm, body: { course_id: course, delta: 3, paid_amount: 300 } });
  check("yöneticisi olmayan şirkette 409, kontenjan eklenmez", r.status === 409 && Number((await q("SELECT COALESCE(SUM(quantity),0) t FROM company_allocations WHERE company_id=?", [co2]))[0].t) === before, JSON.stringify(r));
} catch (err) {
  failN++;
  console.error("✗ beklenmeyen hata:", err);
} finally {
  if (created.users.length) await db.query("DELETE FROM users WHERE id IN (?)", [created.users]);
  if (created.companies.length) await db.query("DELETE FROM companies WHERE id IN (?)", [created.companies]);
  if (created.courses.length) await db.query("DELETE FROM courses WHERE id IN (?)", [created.courses]);
  const left = (await q("SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c, (SELECT COUNT(*) FROM companies WHERE name LIKE ?) co", [`${P}%`, `${P}%`, `%${P}%`]))[0];
  console.log(`temizlik: kalan kullanıcı=${left.u}, kurs=${left.c}, şirket=${left.co}`);
  await db.end();
  console.log(`\n${pass} geçti, ${failN} başarısız`);
  process.exit(failN ? 1 : 0);
}

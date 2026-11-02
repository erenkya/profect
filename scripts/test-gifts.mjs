import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { hashCode } from "../src/lib/verification-code.ts";
// Kurs hediyesi için uçtan uca test (çalışan sunucu + gerçek DB). Kendi kullanıcılarını/kursunu/siparişlerini oluşturur,
// sonunda hepsini siler (e-postalar @example.invalid, kurs slug'ı e2e-gift-*).
// Kullanım:  npm run dev   →   npm run test:gifts     (MAIL_DRY_RUN=true önerilir; aksi halde mailler gerçekten denenir)
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
const SECRET = process.env.JWT_SECRET;
const PW = "Gecici-Sifre-4821!";
const PW2 = "Baska-Sifre-7390!";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };

const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306) });
const stamp = Date.now();
const mail = (n) => `e2e-gift-${stamp}-${n}@example.invalid`;
const SLUG = `e2e-gift-${stamp}`;
const BILLING = (email) => ({ invoice_type: "bireysel", full_name: "E2E Gönderen", email });
const CONSENTS = { distance_sales: true, privacy: true, delivery_return: true, kvkk: true };

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
const gift = async (id) => (await db.query("SELECT * FROM gifts WHERE id=?", [id]))[0][0];
const enrolled = async (userId, courseId) => (await db.query("SELECT source FROM enrollments WHERE user_id=? AND course_id=?", [userId, courseId]))[0][0];
const setKnownCode = (id, code) => db.query("UPDATE users SET verification_token_hash=?, verification_token_expiry = NOW() + INTERVAL 10 MINUTE, verification_attempts=0 WHERE id=?", [hashCode(id, code, SECRET), id]);
const cooldownPassed = (id) => db.query("UPDATE users SET verification_sent_at = NOW() - INTERVAL 2 MINUTE WHERE id=?", [id]);
const giftCooldownPassed = (id) => db.query("UPDATE gifts SET sent_at = NOW() - INTERVAL 2 MINUTE WHERE id=?", [id]);

let adminCookie;
/** Gönderen hediye siparişi verir; sağlayıcı manual ise admin onaylar. { giftId, orderId, status } döner. */
async function sendGift(senderCookie, senderEmail, slug, recipient, message = "Doğum günün kutlu olsun!") {
  const r = await api("/api/gifts/checkout", { cookie: senderCookie, body: { slug, recipient_email: recipient, message, billing: BILLING(senderEmail), consents: CONSENTS } });
  if (r.status !== 201) return { r };
  const [[g]] = await db.query("SELECT id FROM gifts WHERE order_id=?", [r.json.orderId]);
  if (r.json.status === "pending") {
    const a = await api(`/api/admin/orders/${r.json.orderId}`, { method: "PATCH", cookie: adminCookie, body: { action: "approve" } });
    if (a.status !== 200) throw new Error("admin onayı başarısız: " + JSON.stringify(a.json));
  }
  return { r, giftId: g.id, orderId: r.json.orderId, status: r.json.status };
}
/** Gönderenin linkini yeniler ve ham token'ı döndürür (düz token DB'de yok; mailde ve bu yanıtta yaşar). */
async function freshToken(senderCookie, giftId) {
  await giftCooldownPassed(giftId);
  const r = await api(`/api/gifts/${giftId}/link`, { cookie: senderCookie, body: { mode: "copy" } });
  if (r.status !== 200) throw new Error("link yenilenemedi: " + JSON.stringify(r.json));
  return r.json.link.split("/hediye/")[1];
}

let courseId;
try {
  if (!SECRET) throw new Error("JWT_SECRET gerekli (npm run test:gifts .env'i yükler).");
  const [[tbl]] = await db.query("SHOW TABLES LIKE 'gifts'"); if (!tbl) throw new Error("gifts tablosu yok: önce npm run db:migrate");

  // — Hazırlık: test kursu + kullanıcılar
  const [c] = await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 100, 1)", [SLUG, `E2E-${stamp}`.slice(0, 30), "E2E Hediye Kursu"]);
  courseId = c.insertId;
  const S = mail("sender"), R = mail("recipient"), W = mail("wrong"), O = mail("owner"), ADM = mail("admin"), BUY = mail("buyer");
  const sId = await addUser(S), wId = await addUser(W), oId = await addUser(O), buyId = await addUser(BUY);
  await addUser(ADM, { role: "admin" });
  adminCookie = await cookieFor(ADM);
  const sCookie = await cookieFor(S), wCookie = await cookieFor(W), oCookie = await cookieFor(O), buyCookie = await cookieFor(BUY);

  // — Kendine hediye / geçersiz giriş
  let r = await api("/api/gifts/checkout", { cookie: sCookie, body: { slug: SLUG, recipient_email: " " + S.toUpperCase() + " ", billing: BILLING(S), consents: CONSENTS } });
  check("kendi mailine hediye (büyük harf/boşluk) reddedildi (400)", r.status === 400, JSON.stringify(r.json));
  r = await api("/api/gifts/checkout", { body: { slug: SLUG, recipient_email: R, billing: BILLING(S), consents: CONSENTS } });
  check("oturumsuz hediye siparişi 401", r.status === 401);
  r = await api("/api/gifts/checkout", { cookie: sCookie, body: { slug: "yok-" + stamp, recipient_email: R, billing: BILLING(S), consents: CONSENTS } });
  check("olmayan kursa hediye 404", r.status === 404);
  r = await api("/api/gifts/checkout", { cookie: sCookie, body: { slug: SLUG, recipient_email: R, message: "x".repeat(301), billing: BILLING(S), consents: CONSENTS } });
  check("301 karakterlik not reddedildi (400)", r.status === 400);

  // — Mutlu yol: hediye et
  const g1 = await sendGift(sCookie, S, SLUG, "  " + R.toUpperCase() + " ", "Not <script>alert(1)</script>");
  check("hediye siparişi oluştu (201)", g1.r.status === 201, JSON.stringify(g1.r.json));
  let g = await gift(g1.giftId);
  check("DB: gift pending, token_hash 64 hex, süre ~30 gün", g.status === "pending" && /^[0-9a-f]{64}$/.test(g.token_hash ?? "") && g.expires_at !== null, JSON.stringify(g));
  check("DB: alıcı maili normalize (küçük harf, boşluksuz)", g.recipient_email === R, g.recipient_email);
  check("kurs gönderene YAZILMADI (hediye siparişi alıcıya gider)", !(await enrolled(sId, courseId)));
  const [[ord]] = await db.query("SELECT status, user_id, plan FROM orders WHERE id=?", [g1.orderId]);
  check("sipariş ödendi ve gönderene ait", ord.status === "paid" && ord.user_id === sId);
  const [[sendInfo]] = await db.query("SELECT send_count FROM gifts WHERE id=?", [g1.giftId]);
  check("DB: ilk gönderim sayacı 1", sendInfo.send_count === 1);

  // — Link yenileme: cooldown, IDOR, eski token geçersiz
  r = await api(`/api/gifts/${g1.giftId}/link`, { cookie: sCookie, body: { mode: "copy" } });
  check("aktivasyondan hemen sonra link yenileme 429 + retryAfter", r.status === 429 && r.json.retryAfter > 0, JSON.stringify(r.json));
  r = await api(`/api/gifts/${g1.giftId}/link`, { cookie: wCookie, body: { mode: "copy" } });
  check("başkasının hediyesinin linkini yenileme 404 (IDOR)", r.status === 404);
  await giftCooldownPassed(g1.giftId);
  const oldHash = g.token_hash;
  r = await api(`/api/gifts/${g1.giftId}/link`, { cookie: sCookie, body: { mode: "copy" } });
  check("cooldown sonrası link yenileme 200 + yeni link", r.status === 200 && /\/hediye\/[0-9a-f]{64}$/.test(r.json.link), JSON.stringify(r.json));
  const token = r.json.link.split("/hediye/")[1];
  g = await gift(g1.giftId);
  check("DB: token_hash değişti, expires_at uzamadı", g.token_hash !== oldHash && g.send_count === 2);
  const exp1 = g.expires_at;

  // — Linke tıklama: oturumsuz → kayıt; sayfa başlıkları
  let p = await page(`/hediye/${token}`);
  check("oturumsuz + hesapsız alıcı → /kayit?hediye=… yönlendirmesi", [307, 308].includes(p.status) && p.location.includes("/kayit?hediye=" + token), `${p.status} ${p.location}`);
  p = await page(`/kayit?hediye=${token}`);
  check("kayıt sayfası: e-posta alanı kilitli ve hediye adresi dolu", p.status === 200 && p.text.includes(R) && /readOnly|readonly/i.test(p.text), String(p.status));
  p = await page(`/hediye/${"a".repeat(64)}`);
  check("bilinmeyen (geçerli biçimli) token: tek tip geçersiz mesaj", p.status === 200 && p.text.includes("Bu hediye linki geçersiz veya süresi dolmuş"));
  check("hediye sayfası başlıkları: no-referrer + no-store", p.headers.get("referrer-policy") === "no-referrer" && /no-store/.test(p.headers.get("cache-control") ?? ""));

  // — Hediye linkiyle kayıt: e-posta sunucuda kilitlenir
  const attackerEmail = mail("elsewhere");
  r = await api("/api/auth/register", { body: { full_name: "Alıcı Kişi", email: attackerEmail, kvkk: true, turnstileToken: T, giftToken: token } });
  check("giftToken ile kayıt: gövdedeki farklı e-posta yok sayılır (201, hediye adresi)", r.status === 201 && r.json.email === R, JSON.stringify(r.json));
  const [[ru]] = await db.query("SELECT id, email, email_verified, password_hash FROM users WHERE email=?", [R]);
  const [[stray]] = await db.query("SELECT COUNT(*) n FROM users WHERE email=?", [attackerEmail]);
  check("DB: kullanıcı hediye adresiyle açıldı, başka adresle açılmadı", !!ru && ru.email_verified === 0 && stray.n === 0);
  r = await api("/api/auth/register", { body: { full_name: "Bozuk Token", email: mail("bad"), kvkk: true, turnstileToken: T, giftToken: "A".repeat(64) } });
  check("bozuk giftToken ile kayıt reddedildi (400, tek tip mesaj)", r.status === 400 && /geçersiz veya süresi dolmuş/.test(r.json?.message ?? ""), JSON.stringify(r.json));
  p = await page("/kayit");
  check("/kayit sayfası no-referrer başlığı taşır", p.headers.get("referrer-policy") === "no-referrer");

  // — Şifre doğrulamada belirlenir; kayıttaki/önceki şifre geçmez
  r = await login(R, PW); check("doğrulanmamış alıcı: şifreyle giriş oturum açmaz (403)", r.status === 403 && r.auth === "");
  await cooldownPassed(ru.id); await setKnownCode(ru.id, "424242");
  r = await api("/api/auth/register", { body: { full_name: "Saldırgan", email: R, kvkk: true, turnstileToken: T } });
  check("saldırgan aynı adresle yeniden kayıt: yalnızca kod yollar (201)", r.status === 201);
  r = await api("/api/auth/verify-email", { body: { email: R, code: "424242", password: "Saldirgan-Sifre-1!" } });
  check("saldırganın kodu yok: eski kodla doğrulayamaz (400, kod yeniden üretildi)", r.status === 400);
  await setKnownCode(ru.id, "424242");
  r = await api("/api/auth/verify-email", { body: { email: R, code: "424242", password: `${R}Aa1!` } });
  check("e-postayı içeren şifre reddedildi (400, field=password)", r.status === 400 && r.json.field === "password");
  r = await api("/api/auth/verify-email", { body: { email: R, code: "424242", password: PW2 } });
  check("e-posta sahibi kodu girip kendi şifresini seçti (200 + oturum)", r.status === 200 && r.auth !== "", JSON.stringify(r.json));
  const rCookie = r.auth;
  r = await login(R, PW2); check("seçilen şifreyle giriş 200", r.status === 200);
  r = await login(R, "Saldirgan-Sifre-1!"); check("saldırganın şifresi geçmez (401)", r.status === 401);

  // — Alma sayfası ve yetki
  p = await page(`/hediye/${token}`, rCookie);
  check("eşleşen doğrulanmış hesap: 'Hediyeyi Al' kartı", p.status === 200 && p.text.includes("Hediyeyi Al") && p.text.includes("E2E Hediye Kursu"));
  check("not HTML olarak çalışmaz (kaçışlanmış)", !p.text.includes("<script>alert(1)</script>"));
  p = await page(`/hediye/${token}`, wCookie);
  check("yanlış hesap: 'başka bir hesaba ait' + maskeli adres, 'Hediyeyi Al' yok", p.status === 200 && p.text.includes("başka bir hesaba ait") && p.text.includes("e***@example.invalid") && !p.text.includes(R));
  r = await api("/api/gifts/claim", { cookie: wCookie, body: { token } });
  check("yanlış hesapla alma 403", r.status === 403, JSON.stringify(r.json));
  check("yanlış hesap denemesi hediyeyi tüketmedi", (await gift(g1.giftId)).status === "pending" && !(await enrolled(wId, courseId)));
  r = await api("/api/gifts/claim", { body: { token } }); check("oturumsuz alma 401", r.status === 401);
  r = await api("/api/gifts/claim", { cookie: rCookie, body: { token: "../" + "a".repeat(61) } });
  check("bozuk token ile alma: tek tip 404", r.status === 404 && /geçersiz/.test(r.json.message));
  r = await api("/api/gifts/claim", { cookie: rCookie, body: { token: "a".repeat(64) } });
  check("var olmayan token ile alma 404", r.status === 404);

  // — Çift alma yarışı
  const [x, y] = await Promise.all([api("/api/gifts/claim", { cookie: rCookie, body: { token } }), api("/api/gifts/claim", { cookie: rCookie, body: { token } })]);
  const codes = [x.status, y.status].sort();
  check("eş zamanlı iki alma: biri 200, diğeri 404", codes[0] === 200 && codes[1] === 404, codes.join());
  g = await gift(g1.giftId);
  check("DB: claimed, alan kullanıcı, token_hash NULL (tek kullanım)", g.status === "claimed" && g.claimed_by_user_id === ru.id && g.token_hash === null && g.claimed_at !== null);
  check("kurs ALICIYA 'gift' kaynağıyla eklendi", (await enrolled(ru.id, courseId))?.source === "gift");
  check("gönderenin kaydı hâlâ yok", !(await enrolled(sId, courseId)));
  p = await page(`/hediye/${token}`, rCookie); check("alınmış linke tekrar girince tek tip geçersiz mesaj", p.text.includes("Bu hediye linki geçersiz veya süresi dolmuş"));
  r = await api(`/api/gifts/${g1.giftId}/link`, { cookie: sCookie, body: { mode: "copy" } }); check("alınmış hediyenin linki yenilenemez (404)", r.status === 404);

  // — Alıcı kursa zaten sahipse: hediye tüketilmez
  await db.query("INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'purchase')", [oId, courseId]);
  const g2 = await sendGift(sCookie, S, SLUG, O);
  const t2 = await freshToken(sCookie, g2.giftId);
  r = await api("/api/gifts/claim", { cookie: oCookie, body: { token: t2 } });
  check("kursa zaten sahip alıcı: 409", r.status === 409, JSON.stringify(r.json));
  g = await gift(g2.giftId); check("DB: hediye pending kaldı, token korundu", g.status === "pending" && g.token_hash !== null);

  // — Süresi dolmuş (zamanlayıcı yok): alınamaz, tembel olarak expired işaretlenir
  const g3 = await sendGift(sCookie, S, SLUG, W);
  const t3 = await freshToken(sCookie, g3.giftId);
  await db.query("UPDATE gifts SET expires_at = NOW() - INTERVAL 1 SECOND WHERE id=?", [g3.giftId]);
  r = await api("/api/gifts/claim", { cookie: wCookie, body: { token: t3 } });
  check("süresi geçmiş hediye alınamaz (404)", r.status === 404);
  check("DB: tembel olarak expired işaretlendi, kurs eklenmedi", (await gift(g3.giftId)).status === "expired" && !(await enrolled(wId, courseId)));
  p = await page(`/hediye/${t3}`, wCookie); check("süresi geçmiş link sayfası tek tip mesaj", p.text.includes("Bu hediye linki geçersiz veya süresi dolmuş"));
  r = await api("/api/gifts/" + g3.giftId + "/link", { cookie: sCookie, body: { mode: "copy" } }); check("süresi geçmiş hediyenin linki yenilenemez (404)", r.status === 404);

  // — Admin sipariş listesi hediyeyi ayırt eder
  r = await api("/api/admin/orders", { method: "GET", cookie: adminCookie });
  check("admin sipariş listesinde hediye siparişi alıcısıyla işaretli", r.status === 200 && r.json.data.find((o) => o.id === g1.orderId)?.gift_to === R, String(r.status));
  p = await page("/hesabim/siparislerim", sCookie);
  check("Siparişlerim hediye siparişini 'hediye →' ile gösterir", p.status === 200 && p.text.includes("hediye") && p.text.includes(R));

  // — Hediyeler sayfası (gönderen)
  p = await page("/hesabim/hediyeler", sCookie);
  check("Hediyelerim sayfası gönderenin hediyelerini gösterir", p.status === 200 && p.text.includes(R) && p.text.includes("Alındı"));
  p = await page("/hesabim/hediyeler", wCookie);
  check("Hediyelerim sayfası başkasının hediyelerini göstermez", p.status === 200 && !p.text.includes(R));

  // — Ödenmemiş / reddedilen sipariş: token yok, iptal
  const rej = await api("/api/gifts/checkout", { cookie: sCookie, body: { slug: SLUG, recipient_email: mail("rejected"), billing: BILLING(S), consents: CONSENTS } });
  if (rej.json?.status === "pending") {
    const [[gr]] = await db.query("SELECT id, status, token_hash FROM gifts WHERE order_id=?", [rej.json.orderId]);
    check("ödeme bekleyen hediye: awaiting_payment, token YOK", gr.status === "awaiting_payment" && gr.token_hash === null);
    const a = await api(`/api/admin/orders/${rej.json.orderId}`, { method: "PATCH", cookie: adminCookie, body: { action: "reject" } });
    check("admin siparişi reddetti (200)", a.status === 200);
    check("DB: reddedilen siparişin hediyesi cancelled, token yok", (await gift(gr.id)).status === "cancelled" && (await gift(gr.id)).token_hash === null);
  } else console.log("• ödeme sağlayıcısı manual değil: reddetme senaryosu atlandı");

  // — Regresyon: normal sepet satın alma kursu ALICIYA (siparişi verene) yazar
  r = await api("/api/checkout", { cookie: buyCookie, body: { items: [{ type: "course", slug: SLUG }], billing: BILLING(BUY), consents: CONSENTS } });
  check("normal sipariş oluştu (201)", r.status === 201, JSON.stringify(r.json));
  if (r.json?.status === "pending") await api(`/api/admin/orders/${r.json.orderId}`, { method: "PATCH", cookie: adminCookie, body: { action: "approve" } });
  check("normal sipariş: kurs alıcıya 'purchase' kaynağıyla yazıldı (hediye dalı bozmadı)", (await enrolled(buyId, courseId))?.source === "purchase");

  // — Kayıt sonrası doğrulama ekranı şifre ister (şifre kayıtta yok)
  const V = mail("victim");
  r = await api("/api/auth/register", { body: { full_name: "Kurban", email: V, kvkk: true, turnstileToken: T } }); check("normal kayıt şifresiz 201", r.status === 201);
  const [[vu]] = await db.query("SELECT id FROM users WHERE email=?", [V]);
  r = await login(V, PW); check("kayıt sonrası (doğrulamadan) giriş oturum açmaz", r.status === 403 && r.auth === "");
  await setKnownCode(vu.id, "161803");
  r = await api("/api/auth/verify-email", { body: { email: V, code: "161803" } }); check("şifresiz doğrulama 400", r.status === 400);
  r = await api("/api/auth/verify-email", { body: { email: V, code: "161803", password: PW } }); check("şifreyle doğrulama 200", r.status === 200);
  r = await login(V, PW); check("doğrulamada belirlenen şifreyle giriş 200", r.status === 200);
} catch (e) {
  failN++; console.error("✗ BEKLENMEYEN HATA", e);
} finally {
  await db.query("DELETE FROM users WHERE email LIKE ?", [`e2e-gift-${stamp}-%@example.invalid`]); // siparişler/hediyeler/kayıtlar cascade
  await db.query("DELETE FROM courses WHERE slug = ?", [SLUG]);
  const [[left]] = await db.query("SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug=?) c", [`e2e-gift-${stamp}-%`, SLUG]);
  console.log(`temizlik: kalan test kullanıcısı=${left.u}, kalan test kursu=${left.c}`);
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

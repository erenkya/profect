import mysql from "mysql2/promise";
import { hashCode } from "../src/lib/verification-code.ts";
// E-posta doğrulama kodu akışı için uçtan uca test (çalışan sunucu + gerçek DB). Test kullanıcılarını sonunda siler.
// Kullanım:  MAIL_DRY_RUN=true npm run dev   →   npm run test:verify
// MAIL_DRY_RUN sunucuda açık olmalı; aksi halde test e-postaları gerçekten gönderilir.
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
const SECRET = process.env.JWT_SECRET;
const PW = "Gecici-Sifre-4821!";
const PW2 = "Baska-Sifre-7390!";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };

async function api(path, body, cookie = "") {
  const res = await fetch(B + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? [];
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, auth: set.find((c) => c.startsWith("profect_auth_token="))?.split(";")[0] ?? "" };
}
const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const stamp = Date.now();
const mail = (n) => `e2e-verify-${stamp}-${n}@example.invalid`;
const row = async (email) => (await db.query("SELECT *, TIMESTAMPDIFF(SECOND, NOW(), verification_token_expiry) AS ttl FROM users WHERE email=?", [email]))[0][0];
const register = (email, over = {}) => api("/api/auth/register", { full_name: "E2E Doğrulama", email, password: PW, kvkk: true, turnstileToken: T, ...over });
const login = (email, password = PW) => api("/api/auth/login", { email, password, turnstileToken: T });
const cooldownPassed = (id) => db.query("UPDATE users SET verification_sent_at = NOW() - INTERVAL 2 MINUTE WHERE id=?", [id]);
const setKnownCode = (id, code) => db.query("UPDATE users SET verification_token_hash=? WHERE id=?", [hashCode(id, code, SECRET), id]);
const verify = (email, code) => api("/api/auth/verify-email", { email, code });
const resend = (email) => api("/api/auth/resend-verification", { email });

try {
  if (!SECRET) throw new Error("JWT_SECRET gerekli (npm run test:verify .env'i yükler).");

  // — Göç: mevcut hesapların hepsi onaylı
  const [[legacy]] = await db.query("SELECT COUNT(*) n FROM users WHERE email_verified=0 AND email NOT LIKE 'e2e-%'");
  check("göç: onaysız eski hesap kalmadı", legacy.n === 0, String(legacy.n));
  const [[stamped]] = await db.query("SELECT COUNT(*) n FROM users WHERE email_verified=1 AND email_verified_at IS NULL AND email NOT LIKE 'e2e-%'");
  check("göç: eski hesapların onay zamanı dolu", stamped.n === 0, String(stamped.n));

  // — Kayıt
  const a = mail("a");
  let r = await register(a, { kvkk: false }); check("KVKK onaysız kayıt reddedildi", r.status === 400);
  r = await register(a); check("kayıt 201 + needsVerification", r.status === 201 && r.json.needsVerification === true && r.json.email === a, JSON.stringify(r.json));
  check("kayıt oturum açmaz", r.auth === "");
  let u = await row(a);
  check("DB: e-posta onaysız", u.email_verified === 0);
  check("DB: kod özeti 64 hex (ham kod yok)", /^[0-9a-f]{64}$/.test(u.verification_token_hash ?? ""));
  check("DB: kod ~10 dk geçerli", u.ttl > 540 && u.ttl <= 600, String(u.ttl));
  check("DB: sayaçlar (deneme 0, gönderim 1)", u.verification_attempts === 0 && u.verification_send_count === 1 && u.verification_sent_at !== null);
  const firstHash = u.verification_token_hash;

  // — Girişte engel + bekleme süresinde yeni kod gitmez
  r = await login(a); check("onaysız giriş 403 + needsVerification + email", r.status === 403 && r.json.needsVerification === true && r.json.email === a);
  check("onaysız girişte oturum çerezi verilmedi", r.auth === "");
  r = await login(a, "yanlis-Sifre-1!"); check("onaysız hesapta yanlış şifre 401 (durum sızmaz)", r.status === 401);
  u = await row(a); check("bekleme süresinde giriş yeni kod üretmedi", u.verification_token_hash === firstHash);

  // — Sıklık sınırı
  r = await resend(a); check("hemen tekrar gönder 429 + retryAfter", r.status === 429 && r.json.retryAfter > 0 && r.json.retryAfter <= 60, JSON.stringify(r.json));
  r = await register(a, { password: PW2 }); check("bekleme süresinde yeniden kayıt 429", r.status === 429);
  r = await login(a); check("yeniden kayıt denemesi şifreyi değiştirmedi", r.status === 403);

  // — Kod girişi doğrulamaları
  r = await verify(a, "12345"); check("5 haneli kod reddedildi (400)", r.status === 400);
  r = await verify(a, "abcdef"); check("harfli kod reddedildi (400)", r.status === 400);
  u = await row(a); check("biçim hataları deneme hakkı harcamaz", u.verification_attempts === 0);
  await setKnownCode(u.id, "424242");
  r = await verify(a, "000000"); check("yanlış kod 400 + kalan hak", r.status === 400 && /4 deneme/.test(r.json.message), r.json?.message);
  u = await row(a); check("yanlış deneme sayacı arttı", u.verification_attempts === 1 && u.email_verified === 0);

  // — Kilitlenme (5 yanlış) → doğru kod bile geçmez
  for (let i = 0; i < 3; i++) await verify(a, "111111");
  r = await verify(a, "222222"); check("5. yanlışta 429 kilit", r.status === 429, JSON.stringify(r.json));
  r = await verify(a, "424242"); check("kilitliyken doğru kod da reddedilir (429)", r.status === 429);
  u = await row(a); check("kilitliyken hesap onaylanmadı", u.email_verified === 0);

  // — Kilit sonrası yeni kod: sayaç sıfırlanır, eski kod geçersiz
  await cooldownPassed(u.id);
  r = await resend(a); check("bekleme sonrası yeni kod gönderildi (200)", r.status === 200, JSON.stringify(r.json));
  const afterResend = await row(a);
  check("yeni kod: özet değişti, deneme 0, gönderim 2", afterResend.verification_token_hash !== u.verification_token_hash && afterResend.verification_attempts === 0 && afterResend.verification_send_count === 2);
  r = await verify(a, "424242"); check("eski kod yeni kod sonrası geçersiz", r.status === 400);

  // — Süre dolumu → "süresi doldu" + yeni kod isteyebilme
  await setKnownCode(u.id, "135790");
  await db.query("UPDATE users SET verification_token_expiry = NOW() - INTERVAL 1 SECOND, verification_attempts = 0 WHERE id=?", [u.id]);
  r = await verify(a, "135790"); check("süresi dolan doğru kod 410 + mesaj", r.status === 410 && /süresi doldu/.test(r.json.message), JSON.stringify(r.json));
  u = await row(a); check("süresi dolan kodla hesap onaylanmadı", u.email_verified === 0);
  await cooldownPassed(u.id);
  r = await resend(a); check("süre dolunca yeniden gönder çalışır", r.status === 200);
  u = await row(a); check("yeni kodun süresi tekrar ~10 dk", u.ttl > 540);

  // — Başarılı doğrulama: kullanıcı oturum açar
  await setKnownCode(u.id, "987654");
  r = await verify(a, "987 654"); check("doğru kod 200 + oturum çerezi (boşluklu giriş kabul)", r.status === 200 && r.auth !== "" && r.json.user.email === a, JSON.stringify(r.json));
  const cookie = r.auth;
  u = await row(a);
  check("DB: onaylandı + zaman damgası + kod temizlendi", u.email_verified === 1 && u.email_verified_at !== null && u.verification_token_hash === null && u.verification_token_expiry === null);
  r = await api("/api/auth/me", null, cookie); check("doğrulama sonrası oturum geçerli (/me)", r.status === 200, String(r.status));
  r = await verify(a, "987654"); check("kod tek kullanımlık: tekrar kullanılamaz", r.status === 400);
  r = await login(a); check("doğrulama sonrası normal giriş 200", r.status === 200 && r.auth !== "");
  r = await resend(a); check("onaylı hesap için gönder: genel yanıt, kod üretmez", r.status === 200);
  u = await row(a); check("onaylı hesapta kod yok", u.verification_token_hash === null);
  r = await register(a); check("onaylı e-postayla kayıt 409", r.status === 409);

  // — Başka kullanıcının kodu geçmez
  const b = mail("b"), c = mail("c");
  await register(b); await register(c);
  const ub = await row(b), uc = await row(c);
  await setKnownCode(ub.id, "314159");
  r = await verify(c, "314159"); check("başka hesabın kodu geçmez", r.status === 400);
  r = await verify(b, "314159"); check("kendi kodu geçer", r.status === 200);

  // — Yarım kalan kaydı yeniden başlatma (son gönderen kazanır, eski kod geçersiz)
  await cooldownPassed(uc.id);
  await setKnownCode(uc.id, "271828");
  r = await register(c, { full_name: "Yeni İsim", password: PW2 }); check("yarım kayıt yeniden kayıt 201", r.status === 201 && r.json.needsVerification === true, JSON.stringify(r.json));
  r = await verify(c, "271828"); check("yeniden kayıt sonrası eski kod geçersiz", r.status === 400);
  r = await login(c, PW); check("eski şifre artık geçmez (401)", r.status === 401);
  r = await login(c, PW2); check("yeni şifre geçerli, hâlâ doğrulama bekler (403)", r.status === 403 && r.json.needsVerification);
  const uc2 = await row(c); check("ad güncellendi", uc2.full_name === "Yeni İsim");

  // — Saatlik üst sınır
  await db.query("UPDATE users SET verification_send_count=5, verification_window_start=NOW() - INTERVAL 10 MINUTE, verification_sent_at = NOW() - INTERVAL 5 MINUTE WHERE id=?", [uc.id]);
  r = await resend(c); check("saatlik 5 gönderim sınırı: 429", r.status === 429 && r.json.retryAfter > 60, JSON.stringify(r.json));
  await db.query("UPDATE users SET verification_window_start=NOW() - INTERVAL 61 MINUTE WHERE id=?", [uc.id]);
  r = await resend(c); check("pencere dolunca yeniden izin verilir", r.status === 200);
  check("pencere sıfırlandı (gönderim sayısı 1)", (await row(c)).verification_send_count === 1);

  // — Eş zamanlılık
  const d = mail("d"); await register(d); const ud = await row(d);
  await setKnownCode(ud.id, "161803");
  const guesses = await Promise.all(Array.from({ length: 25 }, (_, i) => verify(d, String(100000 + i))));
  const ud2 = await row(d);
  check("25 eş zamanlı yanlış tahmin: sayaç en fazla 5", ud2.verification_attempts === 5, String(ud2.verification_attempts));
  check("25 eş zamanlı tahminde hiçbiri başarılı olmadı", guesses.every((g) => g.status !== 200));
  await cooldownPassed(ud.id);
  const sends = await Promise.all(Array.from({ length: 6 }, () => resend(d)));
  const ud3 = await row(d);
  check("6 eş zamanlı gönder: yalnızca biri kod üretti", ud3.verification_send_count === ud2.verification_send_count + 1, `${ud2.verification_send_count}→${ud3.verification_send_count}`);
  check("eş zamanlı gönderlerde fazlası 429", sends.filter((s) => s.status === 429).length === 5, sends.map((s) => s.status).join());

  // — Bilinmeyen / pasif hesap
  r = await verify(`yok-${stamp}@example.invalid`, "123456"); check("olmayan hesap: 400 genel hata", r.status === 400);
  r = await resend(`yok-${stamp}@example.invalid`); check("olmayan hesap için gönder: 200 genel (sızıntı yok)", r.status === 200 && r.json.success === true);
  await db.query("UPDATE users SET is_active=0 WHERE id=?", [ud.id]);
  await cooldownPassed(ud.id); await setKnownCode(ud.id, "112358");
  await db.query("UPDATE users SET verification_attempts=0, verification_token_expiry = NOW() + INTERVAL 5 MINUTE WHERE id=?", [ud.id]);
  r = await verify(d, "112358"); check("pasif hesap doğrulayamaz (403)", r.status === 403);
  const hashBefore = (await row(d)).verification_token_hash;
  await resend(d); check("pasif hesaba kod gönderilmez", (await row(d)).verification_token_hash === hashBefore);
} catch (e) {
  failN++; console.error("✗ BEKLENMEYEN HATA", e);
} finally {
  await db.query("DELETE FROM users WHERE email LIKE ?", [`e2e-verify-${stamp}-%@example.invalid`]);
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

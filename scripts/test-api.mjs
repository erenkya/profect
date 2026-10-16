import mysql from "mysql2/promise";
// Çalışan bir sunucuya karşı uçtan uca API testi (kurs oluşturur, test kullanıcısı açar, sonunda hepsini siler).
// Kullanım: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run test:api   (önce `npm run dev`)
const B = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
if (!ADMIN.email || !ADMIN.password) { console.error("ADMIN_EMAIL ve ADMIN_PASSWORD gerekli."); process.exit(1); }
const T = "XXXX.DUMMY.TOKEN.XXXX";
const jar = { admin: "", user: "" };
const results = [];
const check = (name, cond, extra = "") => { results.push(cond); console.log(cond ? "✓" : "✗ FAIL", name, extra); };

async function api(who, method, path, body) {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie: jar[who] }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const set = res.headers.getSetCookie?.() ?? [];
  const tok = set.find((c) => c.startsWith("profect_auth_token="));
  if (tok) jar[who] = tok.split(";")[0];
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const email = `e2e-${Date.now()}@example.invalid`;
let courseId, userId;
try {
  let r = await api("admin", "POST", "/api/auth/login", { ...ADMIN, turnstileToken: T });
  check("admin login", r.status === 200);

  // — CMS
  r = await api("admin", "POST", "/api/admin/courses", { title: "E2E Test Kursu", description: "test", price: 100 });
  check("kurs oluştur", r.status === 201, JSON.stringify(r.json)); courseId = r.json.courseId; const slug = r.json.slug;
  r = await api("admin", "POST", `/api/admin/courses/${courseId}/modules`, { title: "Modül 1" });
  const m1 = r.json.moduleId; check("modül ekle", r.status === 201);
  // — video yükleme (tarayıcı gibi: imzalı adrese doğrudan PUT) · gerçek R2'ye yazar, sonunda siler
  const MIB = 1024 * 1024, VIDEO = Buffer.alloc(5 * MIB, 7), CHUNK = 4 * MIB;
  const upInit = (over = {}) => api("admin", "POST", "/api/admin/uploads/video", { module_id: m1, lesson_title: "Video", content_type: "video/mp4", size: VIDEO.length, ...over });
  r = await upInit({ size: 3 * 1024 * MIB }); check("2 GB üstü yükleme reddedildi", r.status === 400);
  r = await upInit({ content_type: "video/webm" }); check("mp4 dışı yükleme reddedildi", r.status === 400);
  r = await upInit({ module_id: 999999999 }); check("olmayan modül 404", r.status === 404);
  r = await upInit(); check("yükleme başlatıldı (201)", r.status === 201, JSON.stringify(r.json).slice(0, 120));
  const key1 = r.json.key; check("anahtar kurs/modül klasöründe", key1.startsWith(`kurslar/${slug}/${m1}-`) && key1.endsWith(".mp4"), key1);
  const put1 = await fetch(r.json.upload.url, { method: "PUT", headers: r.json.upload.headers, body: VIDEO }); check("R2'ye doğrudan PUT", put1.ok, String(put1.status));
  for (const bad of ["dQw4w9WgXcQ", "kurslar/../x.mp4", `kurslar/${slug}/999999-x/a1b2c3d4-x.mp4`, `kurslar/${slug}/${m1}-x/a1b2c3d4-yok.mp4`]) {
    r = await api("admin", "POST", `/api/admin/modules/${m1}/lessons`, { title: "Kötü", lesson_type: "video", content: bad });
    check(`geçersiz video içeriği reddedildi: ${bad.slice(0, 32)}`, r.status === 400, String(r.status));
  }
  r = await api("admin", "POST", `/api/admin/modules/${m1}/lessons`, { title: "Video", lesson_type: "video", content: key1 });
  const l1 = r.json.lessonId; check("video ders ekle", r.status === 201);
  r = await api("admin", "POST", `/api/admin/modules/${m1}/lessons`, { title: "Metin", lesson_type: "text", content: "# Merhaba" });
  const l2 = r.json.lessonId;
  const [[lr]] = await db.query("SELECT content FROM lessons WHERE id=?", [l1]); check("ders içeriği R2 anahtarı", lr.content === key1, lr.content);
  // ders silinince R2 nesnesi de gider (aynı anahtarı tekrar kaydetmek artık 400)
  r = await upInit(); const key2 = r.json.key; await fetch(r.json.upload.url, { method: "PUT", headers: r.json.upload.headers, body: Buffer.alloc(1024, 1) });
  r = await api("admin", "POST", `/api/admin/modules/${m1}/lessons`, { title: "Silinecek", lesson_type: "video", content: key2 }); const l3 = r.json.lessonId;
  r = await api("admin", "DELETE", `/api/admin/lessons/${l3}`); check("video ders silindi", r.status === 200);
  r = await api("admin", "POST", `/api/admin/modules/${m1}/lessons`, { title: "Hayalet", lesson_type: "video", content: key2 }); check("ders silinince R2 nesnesi de silindi", r.status === 400, String(r.status));
  const quiz = { title: "Final", passing_score_percentage: 70, questions: [
    { question_text: "2+2?", options: [{ option_text: "4", is_correct: true }, { option_text: "5", is_correct: false }] },
    { question_text: "3+3?", options: [{ option_text: "6", is_correct: true }, { option_text: "7", is_correct: false }, { option_text: "8", is_correct: false }] } ] };
  r = await api("admin", "POST", "/api/admin/quizzes", { course_id: courseId, ...quiz }); check("final sınav", r.status === 201, JSON.stringify(r.json)); const qid = r.json.quizId;
  r = await api("admin", "POST", "/api/admin/quizzes", { course_id: courseId, ...quiz }); check("ikinci final reddedildi (409)", r.status === 409);
  r = await api("admin", "PUT", `/api/admin/quizzes/${qid}`, { ...quiz, questions: [{ question_text: "x", options: [{ option_text: "a", is_correct: true }, { option_text: "b", is_correct: true }] }] }); check("2 doğru şık reddedildi", r.status === 400);
  r = await api("admin", "PATCH", `/api/admin/courses/${courseId}`, { is_published: true }); check("yayınla", r.status === 200);
  r = await api("admin", "PATCH", "/api/admin/lessons/reorder", { module_id: m1, ids: [l2, l1] }); check("ders sırala", r.status === 200);

  // — kayıt + doğrulama
  r = await api("user", "POST", "/api/auth/register", { full_name: "E2E Test", email, password: "kısa", kvkk: true, turnstileToken: T }); check("kısa parola reddedildi", r.status === 400);
  r = await api("user", "POST", "/api/auth/register", { full_name: "E2E Test", email, password: "Test1234!", kvkk: false, turnstileToken: T }); check("KVKK onaysız reddedildi", r.status === 400);
  r = await api("user", "POST", "/api/auth/register", { full_name: "E2E Test", email, password: "Test1234!", kvkk: true, turnstileToken: T }); check("kayıt", r.status === 201, JSON.stringify(r.json));
  r = await api("user", "POST", "/api/auth/register", { full_name: "E2E Test", email, password: "Test1234!", kvkk: true, turnstileToken: T }); check("aynı e-posta 409", r.status === 409);
  r = await api("user", "POST", "/api/auth/login", { email, password: "Test1234!", turnstileToken: T }); check("doğrulanmamış giriş 403 + needsVerification", r.status === 403 && r.json.needsVerification === true);
  const [[u]] = await db.query("SELECT id, verification_token_hash AS h FROM users WHERE email=?", [email]); userId = u.id;
  check("token DB'de özet olarak (64 hex)", /^[0-9a-f]{64}$/.test(u.h));
  r = await api("user", "POST", "/api/auth/verify-email", { token: "yanlis" }); check("yanlış doğrulama tokenı reddedildi", r.status === 400);
  await db.query("UPDATE users SET email_verified=1 WHERE id=?", [userId]);
  r = await api("user", "POST", "/api/auth/login", { email, password: "Test1234!", turnstileToken: T }); check("kullanıcı girişi", r.status === 200 && r.json.user.role === "user");
  r = await api("user", "GET", "/api/admin/courses"); check("kullanıcı admin API'ye giremez (403)", r.status === 403);

  // — erişim yokken
  r = await api("user", "POST", "/api/client/progress/lesson", { lesson_id: l1 }); check("kayıtsız ilerleme 403 (BOLA)", r.status === 403);
  r = await api("user", "GET", `/api/client/quizzes/${qid}`); check("kayıtsız sınav 403", r.status === 403);
  const vid = (who, headers = {}, id = l1) => fetch(`${B}/api/client/lessons/${id}/video`, { headers: { ...(who ? { cookie: jar[who] } : {}), ...headers } });
  r = await vid(null); check("video: çerezsiz 401", r.status === 401);
  r = await vid("user", { range: "bytes=0-99" }); check("video: kayıtsız öğrenci 403 (BOLA)", r.status === 403);
  r = await vid("admin", { range: "bytes=0-99" }); check("video: admin 206", r.status === 206);
  r = await vid("user", { "sec-fetch-dest": "document" }); check("video: adres çubuğundan açma engellendi", r.status === 403 || r.status === 401);

  // — satın alma (manual) → admin onayı
  r = await api("user", "POST", "/api/checkout", { plan: "single", course_slug: slug }); check("sipariş pending", r.status === 201 && r.json.status === "pending", JSON.stringify(r.json)); const oid = r.json.orderId;
  r = await api("user", "POST", "/api/client/progress/lesson", { lesson_id: l1 }); check("onaysız hâlâ 403", r.status === 403);
  r = await api("user", "PATCH", `/api/admin/orders/${oid}`, { action: "approve" }); check("kullanıcı sipariş onaylayamaz", r.status === 403);
  r = await api("admin", "PATCH", `/api/admin/orders/${oid}`, { action: "approve" }); check("admin onayladı", r.status === 200);
  r = await api("admin", "PATCH", `/api/admin/orders/${oid}`, { action: "approve" }); check("tekrar onay idempotent", r.status === 200);
  r = await api("user", "POST", "/api/checkout", { plan: "single", course_slug: slug }); check("sahip olunan kurs tekrar alınamaz (409)", r.status === 409);

  // — öğrenme
  r = await api("user", "POST", "/api/client/progress/lesson", { lesson_id: l1 }); check("ilerleme %50", r.status === 200 && r.json.percentage === 50, JSON.stringify(r.json));
  r = await api("user", "POST", "/api/client/progress/lesson", { lesson_id: l1 }); check("ilerleme idempotent", r.json.completedLessons === 1);

  // — video akışı (kayıtlı öğrenci)
  r = await vid("user", { range: "bytes=0-99" }); const b99 = Buffer.from(await r.arrayBuffer());
  check("video: Range → 206 + Content-Range", r.status === 206 && r.headers.get("content-range") === `bytes 0-99/${VIDEO.length}` && b99.length === 100, r.headers.get("content-range"));
  check("video: no-store + nosniff + video/mp4", r.headers.get("cache-control") === "private, no-store" && r.headers.get("x-content-type-options") === "nosniff" && r.headers.get("content-type") === "video/mp4");
  check("video: yanıt başlıklarında R2 adresi yok", !JSON.stringify([...r.headers]).includes("cloudflarestorage"));
  r = await vid("user", { range: "bytes=0-" }); const bOpen = Buffer.from(await r.arrayBuffer());
  check("video: açık uçlu aralık 4 MiB'a kısaltıldı", r.status === 206 && bOpen.length === CHUNK && r.headers.get("content-range") === `bytes 0-${CHUNK - 1}/${VIDEO.length}`, String(bOpen.length));
  r = await vid("user", { range: `bytes=${CHUNK}-` }); const bTail = Buffer.from(await r.arrayBuffer());
  check("video: son dilim", r.status === 206 && bTail.length === VIDEO.length - CHUNK);
  r = await vid("user", { range: `bytes=${VIDEO.length}-` }); check("video: dosya sonrası aralık 416", r.status === 416 && r.headers.get("content-range") === `bytes */${VIDEO.length}`);
  r = await vid("user", { range: "bytes=0-1,5-9" }); check("video: çoklu aralık 416", r.status === 416);
  r = await vid("user", {}, 999999999); check("video: olmayan ders 404", r.status === 404);
  r = await fetch(`${B}/ogrenim/${slug}/ders/${l1}`, { headers: { cookie: jar.user } }); const html = await r.text();
  check("ders sayfası: R2 adresi/anahtarı HTML'de yok", r.status === 200 && !html.includes("cloudflarestorage") && !html.includes("kurslar/"), String(r.status));
  let got429 = false; for (let i = 0; i < 12 && !got429; i++) { const x = await vid("user", { range: "bytes=0-" }); await x.arrayBuffer(); got429 = x.status === 429; }
  check("video: günlük kota aşımı 429", got429);
  r = await vid("admin", { range: "bytes=0-" }); await r.arrayBuffer(); check("video: admin kotadan muaf", r.status === 206);
  r = await api("user", "POST", "/api/client/certificates/generate", { course_id: courseId }); check("sınavsız sertifika 403", r.status === 403);
  r = await api("user", "GET", `/api/client/quizzes/${qid}`);
  check("sınav GET: doğru cevap sızmıyor", r.status === 200 && !JSON.stringify(r.json).includes("is_correct"));
  const qs = r.json.data.questions; check("2 soru", qs.length === 2);
  // yanlış cevap
  const wrong = {}; for (const q of qs) wrong[q.id] = q.options[0].id;
  const [correct] = await db.query("SELECT question_id, id FROM options WHERE is_correct=1 AND question_id IN (?)", [qs.map((q) => q.id)]);
  const cm = Object.fromEntries(correct.map((c) => [c.question_id, c.id]));
  const allWrong = {}; for (const q of qs) allWrong[q.id] = q.options.find((o) => o.id !== cm[q.id]).id;
  r = await api("user", "POST", `/api/client/quizzes/${qid}/submit`, { answers: allWrong }); check("tümü yanlış: 0, geçmedi", r.json.score === 0 && r.json.isPassed === false && !JSON.stringify(r.json).includes("correctOption"));
  r = await api("user", "POST", "/api/client/certificates/generate", { course_id: courseId }); check("kalınca sertifika yok (403)", r.status === 403);
  r = await api("user", "POST", `/api/client/quizzes/${qid}/submit`, { answers: cm }); check("doğru cevap: 100, geçti", r.json.score === 100 && r.json.isPassed === true);
  const [[en]] = await db.query("SELECT status FROM enrollments WHERE user_id=? AND course_id=?", [userId, courseId]); check("kayıt 'completed'", en.status === "completed");
  r = await api("user", "POST", "/api/client/certificates/generate", { course_id: courseId }); check("sertifika üretildi", r.status === 200 && /^PRF-\d{4}-\d{6}$/.test(r.json.certificate_code), r.json.certificate_code); const code = r.json.certificate_code;
  r = await api("user", "POST", "/api/client/certificates/generate", { course_id: courseId }); check("sertifika tekrar aynı kod", r.json.certificate_code === code);
  r = await api("user", "GET", `/api/public/certificates/${code.toLowerCase()}`); check("herkese açık doğrulama (küçük harf kabul)", r.status === 200 && r.json.data.student_name === "E2E Test" && !("user_id" in r.json.data) && !("email" in r.json.data));
  r = await fetch(`${B}/api/public/certificates/PRF-2026-000000`); check("olmayan sertifika 404", r.status === 404);

  // — hesap devre dışı → mevcut JWT hemen geçersiz
  await api("admin", "PATCH", `/api/admin/users/${userId}`, { is_active: false });
  r = await api("user", "GET", "/api/auth/me"); check("pasifleştirilen kullanıcının JWT'si geçersiz (401)", r.status === 401);
  r = await api("admin", "PATCH", "/api/admin/users/1", { is_active: false }); check("admin kendini pasifleştiremez", r.status === 400);
} finally {
  if (courseId) {
    const del = jar.admin ? await api("admin", "DELETE", `/api/admin/courses/${courseId}`) : { status: 0 }; // R2 nesneleri de silinir
    if (del.status !== 200) await db.query("DELETE FROM courses WHERE id=?", [courseId]);
  }
  await db.query("DELETE FROM users WHERE email LIKE 'e2e-%@example.invalid'");
  await db.end();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`);
process.exit(results.every(Boolean) ? 0 : 1);

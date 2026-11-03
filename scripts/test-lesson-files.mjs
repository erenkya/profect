import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { DeleteObjectsCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
// Ders dosyaları için uçtan uca test (çalışan sunucu + gerçek DB + gerçek R2). Kendi kullanıcılarını/kursunu oluşturur,
// sonunda hepsini siler (e-postalar @example.invalid, kurs slug'ları e2e-files-*, R2 nesneleri de silinir).
// Kullanım:  npm run dev   →   BASE_URL=http://localhost:3000 npm run test:lesson-files
const B = process.env.BASE_URL ?? "http://localhost:3000";
const T = "XXXX.DUMMY.TOKEN.XXXX";
const PW = "Gecici-Sifre-4821!";
let pass = 0, failN = 0;
const check = (name, cond, extra = "") => { cond ? pass++ : failN++; console.log(cond ? "✓" : "✗ FAIL", name, cond ? "" : extra); };

const db = await mysql.createConnection({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306) });
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const Bucket = process.env.R2_BUCKET;
const hasObject = async (Key) => {
  try { await s3.send(new HeadObjectCommand({ Bucket, Key })); return true; }
  catch (e) { if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return false; throw e; }
};

const stamp = Date.now();
const PREFIX = `e2e-files-${stamp}`;
const mail = (n) => `${PREFIX}-${n}@example.invalid`;
const touchedKeys = new Set(); // temizlik: test sırasında yüklenen tüm R2 anahtarları

async function api(path, { method = "POST", body, cookie = "" } = {}) {
  const res = await fetch(B + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  let json = null; try { json = await res.json(); } catch {}
  const auth = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("profect_auth_token="))?.split(";")[0] ?? "";
  return { status: res.status, json, auth, headers: res.headers };
}
const page = async (path, cookie = "") => { const res = await fetch(B + path, { headers: { cookie }, redirect: "manual" }); return { status: res.status, location: res.headers.get("location") ?? "", text: res.status === 200 ? await res.text() : "" }; };
const addUser = async (email, role = "user") => {
  const [r] = await db.query("INSERT INTO users (full_name, email, password_hash, role, email_verified, email_verified_at, kvkk_consent_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())", ["E2E " + email.split("-").pop().split("@")[0], email, await bcrypt.hash(PW, 10), role]);
  return r.insertId;
};
const cookieFor = async (email) => { const r = await api("/api/auth/login", { body: { email, password: PW, turnstileToken: T } }); if (!r.auth) throw new Error(`giriş başarısız ${email}: ${r.status} ${JSON.stringify(r.json)}`); return r.auth; };

let admin = "";
// Yönetici akışıyla tek dosya yükler: upload başlat → R2'ye PUT → kaydet. Kaydedilen satırın id'sini ve anahtarı döner.
async function uploadFile(lessonId, fileName, content, title = "Test dosyası") {
  const init = await api(`/api/admin/lessons/${lessonId}/files/upload`, { cookie: admin, body: { file_name: fileName, size: Buffer.byteLength(content) } });
  if (init.status !== 201) return { init };
  const { key, upload } = init.json;
  touchedKeys.add(key);
  const put = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: content });
  const reg = await api(`/api/admin/lessons/${lessonId}/files`, { cookie: admin, body: { key, title, file_name: fileName, content_type: "text/plain" } });
  return { init, put, reg, key, id: reg.json?.id };
}
const mkLesson = async (moduleId, n) => (await db.query("INSERT INTO lessons (module_id, title, lesson_type, content, duration_minutes, sort_order) VALUES (?, ?, 'text', 'e2e', 5, ?)", [moduleId, `E2E Ders ${n}`, n]))[0].insertId;
const mkModule = async (courseId, n) => (await db.query("INSERT INTO modules (course_id, title, sort_order) VALUES (?, ?, ?)", [courseId, `E2E Modül ${n}`, n]))[0].insertId;
const mkCourse = async (suffix) => (await db.query("INSERT INTO courses (slug, code, title, description, price, is_published) VALUES (?, ?, ?, 'e2e', 100, 1)", [`${PREFIX}-${suffix}`, `E2EF-${stamp}-${suffix}`.slice(0, 30), `E2E Dosya Kursu ${suffix}`]))[0].insertId;
const rowKey = async (fileId) => (await db.query("SELECT storage_key FROM lesson_files WHERE id = ?", [fileId]))[0][0]?.storage_key;

try {
  const [[tbl]] = await db.query("SHOW TABLES LIKE 'lesson_files'");
  if (!tbl) throw new Error("lesson_files tablosu yok: önce npm run db:migrate");

  // — Hazırlık: 1 kurs, 1 modül, 3 ders (ilk ikisi ücretsiz önizleme), kullanıcılar
  const courseId = await mkCourse("c1");
  const slug = `${PREFIX}-c1`;
  const mod1 = await mkModule(courseId, 1);
  const L1 = await mkLesson(mod1, 1), L2 = await mkLesson(mod1, 2), L3 = await mkLesson(mod1, 3);
  const studentId = await addUser(mail("student"));
  await addUser(mail("outsider"));
  await addUser(mail("admin"), "admin");
  await db.query("INSERT INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'admin')", [studentId, courseId]);
  admin = await cookieFor(mail("admin"));
  const student = await cookieFor(mail("student"));
  const outsider = await cookieFor(mail("outsider"));
  check("sunucu yanıt veriyor ve test kullanıcıları giriş yaptı", !!admin && !!student && !!outsider);

  // 1) Yükleme başlatma doğrulamaları
  const initBody = (b) => api(`/api/admin/lessons/${L3}/files/upload`, { cookie: admin, body: b });
  check("yükleme: çalıştırılabilir (setup.exe) reddedilir", (await initBody({ file_name: "setup.exe", size: 10 })).status === 400);
  check("yükleme: çift uzantı (rapor.pdf.exe) reddedilir", (await initBody({ file_name: "rapor.pdf.exe", size: 10 })).status === 400);
  check("yükleme: 150 MiB üstü reddedilir", (await initBody({ file_name: "buyuk.zip", size: 157_286_401 })).status === 400);
  check("yükleme: olmayan derse 404", (await api("/api/admin/lessons/999999999/files/upload", { cookie: admin, body: { file_name: "a.txt", size: 5 } })).status === 404);
  check("yükleme: yönetici değilse 403", (await api(`/api/admin/lessons/${L3}/files/upload`, { cookie: student, body: { file_name: "a.txt", size: 5 } })).status === 403);

  // 2) Gerçek yükleme + kayıt; boyut R2'den okunur
  const CONTENT = "merhaba dosya";
  const up = await uploadFile(L3, "Hafta 1 Sunumu.txt", CONTENT, "Hafta 1 sunumu");
  check("yükleme: R2 PUT başarılı, kayıt 201", up.init?.status === 201 && up.put?.ok && up.reg?.status === 201 && !!up.id, JSON.stringify({ init: up.init?.status, put: up.put?.status, reg: up.reg?.json }));
  const [[row]] = await db.query("SELECT size_bytes, file_name, title FROM lesson_files WHERE id = ?", [up.id]);
  check("kayıt: boyut R2'den (13), özgün ad ve görünen ad doğru", Number(row?.size_bytes) === Buffer.byteLength(CONTENT) && row.file_name === "Hafta 1 Sunumu.txt" && row.title === "Hafta 1 sunumu", JSON.stringify(row));
  check("R2'de nesne var ve anahtar dosyalar/<ders>/ altında", (await hasObject(up.key)) && up.key.startsWith(`dosyalar/${L3}/`), up.key);

  // 3) Kayıt doğrulamaları
  const reg = (lessonId, key) => api(`/api/admin/lessons/${lessonId}/files`, { cookie: admin, body: { key, title: "x", file_name: "a.txt", content_type: "text/plain" } });
  const other = await api(`/api/admin/lessons/${L1}/files/upload`, { cookie: admin, body: { file_name: "baska.txt", size: 5 } }); // L1 için anahtar (yüklenmedi)
  touchedKeys.add(other.json.key);
  check("kayıt: başka dersin anahtarı 400", (await reg(L3, other.json.key)).status === 400);
  check("kayıt: video anahtarı 400", (await reg(L3, "kurslar/x/1-y/a1b2c3d4-z.mp4")).status === 400);
  check("kayıt: '../' içeren anahtar 400", (await reg(L3, `dosyalar/${L3}/../x`)).status === 400);
  check("kayıt: R2'de olmayan (PUT edilmemiş) anahtar 400", (await reg(L1, other.json.key)).status === 400);
  check("kayıt: aynı anahtarın ikinci kaydı 409", (await reg(L3, up.key)).status === 409);

  // 4) Kayıtlı öğrenci indirir
  const dl = await fetch(`${B}/api/client/lessons/${L3}/files/${up.id}`, { headers: { cookie: student }, redirect: "manual" });
  const loc = dl.headers.get("location") ?? "";
  check("indirme: kayıtlı öğrenci 302 + R2 adresi, no-store", dl.status === 302 && loc.includes("r2.cloudflarestorage.com") && (dl.headers.get("cache-control") ?? "").includes("no-store"), `${dl.status} ${loc.slice(0, 80)}`);
  const body = loc ? await fetch(loc) : null;
  check("indirme: imzalı adres içeriği döner, attachment + özgün ad", body?.ok && (await body.text()) === CONTENT && /^attachment;/.test(body.headers.get("content-disposition") ?? "") && decodeURIComponent(body.headers.get("content-disposition") ?? "").includes("Hafta 1 Sunumu.txt"), body?.headers.get("content-disposition") ?? "yok");
  const adl = await fetch(`${B}/api/client/lessons/${L3}/files/${up.id}`, { headers: { cookie: admin }, redirect: "manual" });
  check("indirme: yönetici 302", adl.status === 302);

  // 5) Yetkisizler ve sızıntı
  check("indirme: kayıtsız kullanıcı 403", (await fetch(`${B}/api/client/lessons/${L3}/files/${up.id}`, { headers: { cookie: outsider }, redirect: "manual" })).status === 403);
  check("indirme: girişsiz 401", (await fetch(`${B}/api/client/lessons/${L3}/files/${up.id}`, { redirect: "manual" })).status === 401);
  const stuPage = await page(`/ogrenim/${slug}/ders/${L3}`, student);
  check("sayfa: kayıtlı öğrencide 'Ders dosyaları' ve dosya adı görünür, imzalı adres yok", stuPage.status === 200 && stuPage.text.includes("Ders dosyaları") && stuPage.text.includes("Hafta 1 sunumu") && !stuPage.text.includes("X-Amz-Signature") && stuPage.text.includes(`/api/client/lessons/${L3}/files/${up.id}`), String(stuPage.status));
  const outPage = await page(`/ogrenim/${slug}/ders/${L3}`, outsider);
  check("sayfa: kayıtsız kullanıcı önizleme dışı dersi açamaz (yönlendirilir)", outPage.status >= 300 && outPage.status < 400, String(outPage.status));

  // 6) Ders/dosya eşleşmesi
  check("indirme: dosya başka dersin URL'sinde 404", (await fetch(`${B}/api/client/lessons/${L1}/files/${up.id}`, { headers: { cookie: student }, redirect: "manual" })).status === 404);

  // 7) Ücretsiz önizleme dersi: kayıtsız için dosya yok
  const pv = await uploadFile(L1, "onizleme.txt", "gizli", "Önizleme dosyası");
  check("önizleme dersine dosya eklendi", pv.reg?.status === 201, JSON.stringify(pv.reg?.json));
  check("önizleme: kayıtsız kullanıcı indiremez (403)", (await fetch(`${B}/api/client/lessons/${L1}/files/${pv.id}`, { headers: { cookie: outsider }, redirect: "manual" })).status === 403);
  const outPrev = await page(`/ogrenim/${slug}/ders/${L1}`, outsider);
  check("önizleme: kayıtsız kullanıcı dersi görür ama 'Ders dosyaları' yok", outPrev.status === 200 && !outPrev.text.includes("Ders dosyaları") && !outPrev.text.includes("Önizleme dosyası"), String(outPrev.status));
  const stuPrev = await page(`/ogrenim/${slug}/ders/${L1}`, student);
  check("önizleme dersi: kayıtlı öğrencide dosya listesi var", stuPrev.status === 200 && stuPrev.text.includes("Önizleme dosyası"), String(stuPrev.status));

  // 8) Yeniden adlandırma ve silme
  const ren = await api(`/api/admin/lesson-files/${up.id}`, { method: "PATCH", cookie: admin, body: { title: "Yeni ad" } });
  const [[after]] = await db.query("SELECT title FROM lesson_files WHERE id = ?", [up.id]);
  check("yeniden adlandırma: PATCH 200 ve DB güncellendi", ren.status === 200 && after.title === "Yeni ad");
  check("yeniden adlandırma: boş başlık 400, olmayan dosya 404", (await api(`/api/admin/lesson-files/${up.id}`, { method: "PATCH", cookie: admin, body: { title: "  " } })).status === 400 && (await api("/api/admin/lesson-files/999999999", { method: "PATCH", cookie: admin, body: { title: "x" } })).status === 404);
  const del = await api(`/api/admin/lesson-files/${up.id}`, { method: "DELETE", cookie: admin });
  check("silme: DELETE 200, satır ve R2 nesnesi gitti", del.status === 200 && !(await rowKey(up.id)) && !(await hasObject(up.key)));
  check("silme: yönetici değilse 403", (await api(`/api/admin/lesson-files/${pv.id}`, { method: "DELETE", cookie: student })).status === 403);

  // 9) Ders / modül / kurs silinince R2 nesneleri de gider
  const f2 = await uploadFile(L2, "ders-silinecek.txt", "x");
  check("ders silme: önce dosya kaydedildi", f2.reg?.status === 201);
  check("ders silme: DELETE 200", (await api(`/api/admin/lessons/${L2}`, { method: "DELETE", cookie: admin })).status === 200);
  check("ders silme: R2 nesnesi silindi ve satır kalmadı", !(await hasObject(f2.key)) && !(await rowKey(f2.id)));

  const mod2 = await mkModule(courseId, 2);
  const L4 = await mkLesson(mod2, 4);
  const f3 = await uploadFile(L4, "modul-silinecek.txt", "x");
  check("modül silme: dosya kaydedildi, modül silinir, R2 nesnesi gider", f3.reg?.status === 201 && (await api(`/api/admin/modules/${mod2}`, { method: "DELETE", cookie: admin })).status === 200 && !(await hasObject(f3.key)));

  const c2 = await mkCourse("c2");
  const m3 = await mkModule(c2, 1);
  const L5 = await mkLesson(m3, 1);
  const f4 = await uploadFile(L5, "kurs-silinecek.txt", "x");
  check("kurs silme: dosya kaydedildi, kurs silinir, R2 nesnesi gider", f4.reg?.status === 201 && (await api(`/api/admin/courses/${c2}`, { method: "DELETE", cookie: admin })).status === 200 && !(await hasObject(f4.key)));

  // 10) Yönetici ağacı dosyaları taşır
  const adm = await page(`/admin/kurslar/${courseId}`, admin);
  check("yönetici kurs sayfası açılır ve kayıtlı önizleme dosyasını gösterir", adm.status === 200 && adm.text.includes("Önizleme dosyası"), String(adm.status));
} catch (e) {
  failN++;
  console.log("✗ FAIL beklenmeyen hata:", e);
} finally {
  try {
    await db.query("DELETE FROM users WHERE email LIKE ?", [`${PREFIX}-%@example.invalid`]);
    await db.query("DELETE FROM courses WHERE slug LIKE ?", [`${PREFIX}-%`]); // modül/ders/lesson_files cascade
    const keys = [...touchedKeys];
    let leftObjects = 0;
    for (const k of keys) if (await hasObject(k)) leftObjects++;
    if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
    const [[left]] = await db.query(
      "SELECT (SELECT COUNT(*) FROM users WHERE email LIKE ?) u, (SELECT COUNT(*) FROM courses WHERE slug LIKE ?) c",
      [`${PREFIX}-%`, `${PREFIX}-%`]);
    console.log(`temizlik: kalan test kullanıcısı=${left.u}, kalan test kursu=${left.c}, temizlikte silinen sahipsiz R2 nesnesi=${leftObjects}`);
    if (left.u || left.c) failN++;
  } catch (e) {
    failN++;
    console.log("✗ FAIL temizlik hatası:", e);
  }
  await db.end();
}
console.log(`\n${pass} geçti, ${failN} başarısız`);
process.exit(failN ? 1 : 0);

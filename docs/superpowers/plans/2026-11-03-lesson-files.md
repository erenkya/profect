# Ders Dosyaları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yönetici bir derse birden fazla indirilebilir dosya ekleyebilsin; yalnızca o kursa erişimi olan öğrenciler (ve yönetici) ders sayfasından indirebilsin.

**Architecture:** Dosyalar mevcut R2 bucket'ında `dosyalar/<lessonId>/…` anahtarlarında durur, meta bilgi yeni `lesson_files` tablosundadır. Yükleme, videodaki gibi tarayıcıdan R2'ye imzalı PUT ile yapılır ve ardından sunucuda `HEAD` ile doğrulanıp kaydedilir. İndirme, sunucuda oturum + `canAccessCourse` doğrulandıktan sonra 60 sn geçerli imzalı R2 GET adresine `302` yönlendirmesidir (Vercel 4,5 MB gövde sınırı yüzünden dosya sunucudan akıtılmaz).

**Tech Stack:** Next.js 16 App Router (route handlers), MySQL/`mysql2` düz SQL, zod, `@aws-sdk/client-s3` + `s3-request-presigner` (Cloudflare R2), Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-03-lesson-files-design.md`

## Global Constraints

- `AGENTS.md`: Next.js bu sürümde farklıdır; route handler yazmadan önce `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` ve `.../03-api-reference/03-file-conventions/route.md` okunur. Mevcut rotalarda `params` bir `Promise`'dir (`await params`).
- Dosya başına üst sınır `MAX_LESSON_FILE_BYTES = 157_286_400` (150 MiB); alt sınır 1 bayt.
- Engellenen uzantılar (küçük/büyük harf duyarsız, **son** uzantı): `exe msi bat cmd com scr sh ps1 vbs jar app dmg apk`. Beyaz liste yok.
- R2 anahtarı: `dosyalar/<lessonId>/<8 hex>-<ascii-slug>[.<uzantı>]`; mevcut `R2_BUCKET` kullanılır, yeni bucket yok.
- Yükleme imzalı PUT'u `ContentType: application/octet-stream` ile imzalanır; indirme her zaman `attachment` + `application/octet-stream`.
- İndirme imzalı adresi 60 sn geçerlidir ve **yalnızca** indirme rotası tarafından üretilir; liste/sayfa HTML'inde imzalı adres bulunmaz. İndirme yanıtı `Cache-Control: private, no-store`.
- İndirmede ücretsiz önizleme (`isPreviewLesson`) istisnası **yoktur**: erişim = yönetici ya da `canAccessCourse`.
- Görünen ad (`title`) 1–120 karakter; `file_name` en çok 255 karakter.
- Migration numarası **019** (uygularken `ls db/migrations` ile doğrula). Tüm kullanıcı metinleri Türkçe.
- İndirme sayısı kotası, önizlemede dosya, kurs düzeyi dosya, sürükle-bırak sıralama: kapsam dışı.

## Review Focus

1. Dosya adında Türkçe harf, boşluk, tırnak, `;`, satır sonu (`\r\n`) varsa `Content-Disposition` başlığı bozulmamalı ve başlık enjeksiyonu olmamalı (Task 1).
2. `rapor.pdf.exe`, `SETUP.EXE`, uzantısız `run`, sonunda nokta/boşluk olan `x.exe.` adlarında engelleme tutarlı olmalı (Task 1).
3. İstemci PUT'tan önce yalan söyledi / PUT sonrası nesne 150 MiB'ı aşıyor ya da 0 bayt: kayıt adımı `HEAD` boyutuna göre reddetmeli ve nesneyi silmeli (Task 3).
4. Başka derse ait, video ya da `../` içeren anahtarla kayıt denemesi reddedilmeli; aynı anahtarın iki kez kaydı 409 vermeli (Task 2, 3).
5. A dersinin dosya ID'si B dersi URL'sinde istenirse 404; kayıtsız 403, girişsiz 401, önizleme dersinde bile dosya yok (Task 4, 7).

---

### Task 1: Saf yardımcılar `lesson-file.ts` (+ dal ve doküman commit'i)

**Files:**
- Create: `src/lib/lesson-file.ts`
- Test: `src/lib/lesson-file.test.ts`
- Commit also: `docs/superpowers/specs/2026-11-03-lesson-files-design.md`, bu plan

**Interfaces:**
- Consumes: `slugify(input: string, fallback: string): string` (`src/lib/video-key.ts`).
- Produces (hepsi sunucu bağımlılığı olmayan saf fonksiyonlar, istemci bileşenleri de import eder):
  - `MAX_LESSON_FILE_BYTES: number`
  - `BLOCKED_EXTENSIONS: readonly string[]`
  - `fileExtension(name: string): string` — son uzantı, küçük harf, noktasız; yoksa `""`.
  - `cleanFileName(name: string): string` — yol ayırıcıları (`/`, `\`), kontrol karakterleri ve baştaki/sondaki boşluk-nokta atılır; en çok 255 karakter (kısaltırken uzantı korunur); boş kalırsa `"dosya"`.
  - `isBlockedFileName(name: string): boolean` — `cleanFileName` sonrası uzantıya bakar.
  - `buildLessonFileKey(lessonId: number, fileName: string, random: string): string`
  - `isLessonFileKey(key: string): boolean`
  - `lessonFileKeyForLesson(key: string, lessonId: number): boolean` — biçim geçerli **ve** ders ID'si tam sayı olarak eşleşiyor.
  - `contentDispositionAttachment(fileName: string): string` — `attachment; filename="<ascii yedek>"; filename*=UTF-8''<yüzde kodlu>`.
  - `formatFileSize(bytes: number): string` — `"850 B"`, `"12,5 KB"`, `"2,4 MB"` (Türkçe ondalık virgül, bir basamak; KB/MB 1024 tabanlı).

- [ ] **Step 1: Dalı aç, dokümanları commit et**

```bash
git checkout -b feat/lesson-files
git add docs/superpowers/specs/2026-11-03-lesson-files-design.md docs/superpowers/plans/2026-11-03-lesson-files.md
git commit -m "docs(lesson-files): design and plan"
```

- [ ] **Step 2: Failing test yaz** — `src/lib/lesson-file.test.ts` (`cover-key.test.ts` biçimi: `node:test`, `./lesson-file.ts` import'u). Testler:
  - `fileExtension`: `"A.PDF"→"pdf"`, `"rapor.pdf.exe"→"exe"`, `"run"→""`, `".gitignore"→""` (yalnızca baştaki nokta uzantı sayılmaz).
  - `isBlockedFileName`: `SETUP.EXE`, `rapor.pdf.exe`, `a.sh`, `x.exe.`, `x.exe ` true; `sunum.pptx`, `kod.zip`, `main.py`, `run` (uzantısız), `exe` (yalnızca ad) false.
  - `cleanFileName`: `"..\\..\\evil.txt"→"evil.txt"`, `"a/b/c.pdf"→"c.pdf"`, `"x\r\ny.pdf"` içinde `\r`/`\n` yok; 300 karakterlik ad 255'e iner ve `.pdf` uzantısı korunur; `"   "→"dosya"`.
  - `buildLessonFileKey(7,"Hafta 3 Sunumu.PPTX","a1b2c3d4")==="dosyalar/7/a1b2c3d4-hafta-3-sunumu.pptx"`; uzantısız ad → uzantı eklenmez; Türkçe harfli ad (`"Çalışma Şablonu.zip"`) ASCII slug olur; slug boşsa (`"???.pdf"`) `-dosya.pdf`.
  - `isLessonFileKey`: geçerli anahtar true; `""`, `dosyalar/7/../x`, `dosyalar/x/a1b2c3d4-a.pdf`, `kurslar/a/1-b/a1b2c3d4-c.mp4`, büyük harfli hex, ` dosyalar/7/a1b2c3d4-a.pdf` false.
  - `lessonFileKeyForLesson(k,7)` true, `(k,70)` ve `(k,1)` false (önek eşleşmesi değil tam sayı eşleşmesi).
  - `contentDispositionAttachment('Rapor "Q1"; ş.pdf')`: `attachment;` ile başlar, ham `"` ve `;` kullanıcı adından kaçar, `filename*=UTF-8''` yüzde kodlu `%C5%9F` içerir, yanıtta `\r`/`\n` yoktur; CRLF içeren adla çağrıldığında da çıktı tek satırdır.
  - `formatFileSize`: `850→"850 B"`, `1536→"1,5 KB"`, `2_516_582→"2,4 MB"`.

- [ ] **Step 3: Testin düştüğünü doğrula**

Run: `npm test`
Expected: `lesson-file.test.ts` FAIL (modül yok).

- [ ] **Step 4: `src/lib/lesson-file.ts`'i yaz** — yukarıdaki imzalar; anahtar regex'i `^dosyalar/([0-9]+)/[a-f0-9]{8}-[a-z0-9-]+(\.[a-z0-9]{1,10})?$`; uzantı anahtara yalnızca `[a-z0-9]{1,10}` ise yazılır; `slugify(base, "dosya")` kullanılır.

- [ ] **Step 5: Testin geçtiğini doğrula**

Run: `npm test`
Expected: tüm testler PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/lesson-file.ts src/lib/lesson-file.test.ts
git commit -m "feat(lesson-files): pure file helpers"
```

---

### Task 2: Migration, R2 yardımcıları, DB modülü, zod şemaları

**Files:**
- Create: `db/migrations/019_lesson_files.sql`, `src/lib/lesson-files.ts`
- Modify: `src/lib/r2.ts`, `src/lib/admin-schemas.ts`, `src/lib/lms.ts` (`AdminLesson` + `getCourseAdminTree`, yaklaşık satır 641–680)
- Test: `src/lib/admin-schemas.test.ts`

**Interfaces:**
- Consumes: Task 1 (`MAX_LESSON_FILE_BYTES`, `isBlockedFileName`, `cleanFileName`, `isLessonFileKey`).
- Produces:
  - SQL: `lesson_files(id INT UNSIGNED PK AI, lesson_id INT UNSIGNED NOT NULL FK→lessons(id) ON DELETE CASCADE + KEY, title VARCHAR(120) NOT NULL, file_name VARCHAR(255) NOT NULL, storage_key VARCHAR(255) NOT NULL UNIQUE, size_bytes BIGINT UNSIGNED NOT NULL, content_type VARCHAR(127) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)` — `001_init.sql`'deki motor/charset/collation ile.
  - `r2.ts`: `presignFileUpload(key: string, size: number): Promise<{ url: string; headers: Record<string,string> }>` (10 dk, `ContentType: "application/octet-stream"`); `presignFileDownload(key: string, contentDisposition: string): Promise<string>` (60 sn, `ResponseContentDisposition` + `ResponseContentType: "application/octet-stream"`); takma adlar `headFile = headVideo`, `deleteFile = deleteVideo`, `deleteFiles = deleteVideos`.
  - `lesson-files.ts` (`server-only`): `type LessonFileItem = { id: number; title: string; file_name: string; size_bytes: number }`; `listLessonFiles(lessonId: number): Promise<LessonFileItem[]>`; `getLessonFileForDownload(lessonId: number, fileId: number): Promise<{ storage_key: string; file_name: string; course_id: number } | null>` (dosya **ve** ders eşleşmeli); `addLessonFile(d: { lessonId: number; title: string; fileName: string; key: string; size: number; contentType: string }): Promise<number>` (UNIQUE ihlalinde `ER_DUP_ENTRY` hatası fırlatır); `renameLessonFile(fileId: number, title: string): Promise<boolean>`; `removeLessonFile(fileId: number): Promise<string | null>` (satırı siler, `storage_key` döner); `listLessonFileKeys(scope: "lesson" | "module" | "course", id: number): Promise<string[]>` (`listVideoKeys` ile aynı SQL kapsamları).
  - `admin-schemas.ts`: `lessonFileUploadSchema` `{ file_name: string(1..255), size: int 1..MAX_LESSON_FILE_BYTES }` (engelli uzantı → "Bu dosya türü yüklenemez."), `lessonFileRegisterSchema` `{ key: string, title: string trim 1..120, file_name: string(1..255), content_type: string max 127 }` (anahtar `isLessonFileKey` değilse reddedilir), `lessonFileRenameSchema` `{ title: string trim 1..120 }`.
  - `AdminLesson` tipine `files: LessonFileItem[]` eklenir; `getCourseAdminTree` dersleri tek ek sorguyla (`WHERE lesson_id IN (…)`) dolduracak şekilde günceller (ders yoksa sorgu atılmaz).

- [ ] **Step 1: Failing test yaz** — `admin-schemas.test.ts`'e: geçerli `lessonFileUploadSchema` `{file_name:"sunum.pptx", size:1024}` kabul; `size:0`, `size:157_286_401`, `file_name:"setup.exe"`, `file_name:"rapor.pdf.exe"` ret; `lessonFileRegisterSchema` geçerli anahtar (`dosyalar/7/a1b2c3d4-sunum.pptx`) kabul, video anahtarı (`KEY` sabiti) ve `dosyalar/../x` ret, `title:"   "` ret; `lessonFileRenameSchema` 121 karakterlik başlık ret.

- [ ] **Step 2: Run** `npm test` → yeni testler FAIL.

- [ ] **Step 3: Şemaları `admin-schemas.ts`'e ekle** (mevcut `videoUploadSchema` yanında, Türkçe mesajlarla).

- [ ] **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Migration yaz**, `npm run db:migrate` ile uygula.

Run: `npm run db:migrate`
Expected: `019_lesson_files.sql` uygulandı satırı; `DESCRIBE lesson_files` tüm alanları gösterir.

- [ ] **Step 6: `r2.ts` eklerini, `lesson-files.ts`'i yaz; `AdminLesson`/`getCourseAdminTree`'yi güncelle.** İmzalı GET için `GetObjectCommand({ Bucket, Key, ResponseContentDisposition, ResponseContentType })`, `expiresIn: 60`.

- [ ] **Step 7: Doğrula**

Run: `npm run typecheck && npm test`
Expected: hatasız, tüm testler PASS.

- [ ] **Step 8: Commit**

```bash
git add db/migrations/019_lesson_files.sql src/lib/lesson-files.ts src/lib/r2.ts src/lib/admin-schemas.ts src/lib/admin-schemas.test.ts src/lib/lms.ts
git commit -m "feat(lesson-files): schema, db helpers and r2 presign"
```

---

### Task 3: Yönetici API rotaları ve silme temizliği

**Files:**
- Create: `src/app/api/admin/lessons/[lessonId]/files/upload/route.ts`, `src/app/api/admin/lessons/[lessonId]/files/route.ts`, `src/app/api/admin/lesson-files/[fileId]/route.ts`
- Modify: `src/app/api/admin/lessons/[lessonId]/route.ts` (DELETE), `src/app/api/admin/modules/[moduleId]/route.ts` (DELETE), `src/app/api/admin/courses/[courseId]/route.ts` (DELETE)

**Interfaces:**
- Consumes: Task 2 (şemalar, `lesson-files.ts`, `r2.ts` ekleri); `requireAdmin`, `parseBody`, `parseId`, `ok`, `fail`, `serverError` (mevcut kalıp: `src/app/api/admin/uploads/video/route.ts`).
- Produces (HTTP):
  - `POST /api/admin/lessons/:lessonId/files/upload` gövde `{file_name,size}` → `201 { key, upload: { url, headers } }`; ders yoksa 404.
  - `POST /api/admin/lessons/:lessonId/files` gövde `{key,title,file_name,content_type}` → `201 { id }`. Anahtar `lessonFileKeyForLesson(key, lessonId)` değilse 400 "Geçersiz dosya."; `headFile` yoksa 400 "Dosya R2'de bulunamadı; yeniden yükleyin."; boyut `HEAD`'den okunur, `0` ya da `> MAX_LESSON_FILE_BYTES` ise nesne `deleteFile` ile silinir ve 400; `file_name` `cleanFileName`'den geçer ve engelli ise 400; `ER_DUP_ENTRY` → 409.
  - `PATCH /api/admin/lesson-files/:fileId` gövde `{title}` → `200 {}`; yoksa 404.
  - `DELETE /api/admin/lesson-files/:fileId` → satır silinir, `deleteFile(key)`; `200 {}`; yoksa 404.
  - Ders/modül/kurs DELETE rotaları, mevcut `listVideoKeys` satırının yanına `listLessonFileKeys(scope, id)` çağırır (cascade'den **önce**) ve `deleteVideos(keys)` yanında `deleteFiles(fileKeys)` çağırır.

- [ ] **Step 1: Next.js kılavuzunu oku** (Global Constraints'teki iki dosya) ve `uploads/video/route.ts`'i örnek al.

- [ ] **Step 2: Üç rota dosyasını yaz**; ders varlığı kontrolü için `getLesson` (`lms.ts`) kullanılır.

- [ ] **Step 3: Üç DELETE rotasını güncelle.**

- [ ] **Step 4: Doğrula**

Run: `npm run typecheck`
Expected: hatasız. (Uçtan uca davranış Task 7'deki betikle doğrulanır.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin
git commit -m "feat(lesson-files): admin upload, register, rename, delete and cascade cleanup"
```

---

### Task 4: Öğrenci indirme rotası

**Files:**
- Create: `src/app/api/client/lessons/[lessonId]/files/[fileId]/route.ts`

**Interfaces:**
- Consumes: `requireUser`, `parseId`, `fail`, `serverError`; `canAccessCourse` (`lms.ts`); `getLessonFileForDownload`; `contentDispositionAttachment`; `presignFileDownload`.
- Produces: `GET /api/client/lessons/:lessonId/files/:fileId` → `302` `Location: <60 sn imzalı R2 GET>`, başlıklar `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`. Hatalar: geçersiz ID 400; girişsiz 401 (`requireUser` kalıbı); dosya ya da ders eşleşmesi yok 404; yönetici değil ve `canAccessCourse` false → 403 "Bu kursa erişiminiz yok." **`isPreviewLesson` kullanılmaz.**

- [ ] **Step 1: Kılavuzları oku** (Task 3'tekiyle aynı; yönlendirme için `NextResponse.redirect(url, 302)` kullanımı) ve `client/lessons/[lessonId]/video/route.ts`'in yetki akışını örnek al (burada `sec-fetch-dest: document` engeli **olmamalı**; indirme bir navigasyondur).

- [ ] **Step 2: Rotayı yaz** (`export const runtime = "nodejs"`).

- [ ] **Step 3: Doğrula**

Run: `npm run typecheck`
Expected: hatasız. (Davranış Task 7'de.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/client/lessons/[lessonId]/files"
git commit -m "feat(lesson-files): authorized download redirect"
```

---

### Task 5: Yönetici arayüzü — ders formunda "Dosyalar" bölümü

**Files:**
- Create: `src/components/admin/LessonFilesField.tsx`
- Modify: `src/components/admin/CourseBuilder.tsx` (`LessonForm`, satır ~218–268)

**Interfaces:**
- Consumes: `adminApi` (`src/components/admin/api.ts`); `AdminLesson.files` (Task 2); `MAX_LESSON_FILE_BYTES`, `isBlockedFileName`, `formatFileSize`, `cleanFileName` (Task 1); `useRouter().refresh()`.
- Produces: `LessonFilesField({ lessonId, files }: { lessonId: number; files: LessonFileItem[] })` — kendi API çağrılarını yapar (ders formunun "Kaydet"inden bağımsız, anında kalıcıdır). `LessonForm`, `initial` varsa bileşeni `initial.id` ve `initial.files` ile gösterir; `initial` yoksa (yeni ders) "Dosyaları ders kaydedildikten sonra ekleyebilirsiniz." notunu gösterir. Form içinde olduğu için tüm düğmeler `type="button"`.

- [ ] **Step 1: `LessonFilesField.tsx`'i yaz.** Davranış: mevcut dosya satırları (ad, `file_name`, boyut; "Yeniden adlandır" satır içi düzenleme → `PATCH /api/admin/lesson-files/:id`; "Sil" → `confirm` sonra `DELETE`); altında `VideoUploadField.tsx` düzeninde sürükle-bırak/seç alanı (`multiple`), seçilen dosyalar **sırayla** yüklenir: istemci tarafı ön kontrol (engelli uzantı, 150 MiB) → `POST …/files/upload` → `XMLHttpRequest` ile `PUT` (ilerleme çubuğu, iptal) → `POST …/files` (başlık varsayılanı: uzantısız dosya adı) → `router.refresh()`. Bir dosya başarısız olursa hata gösterilir, sıradakilere devam edilir. Yükleme sürerken `LessonForm`'un Kaydet'i kapatılmaz (dosyalar ayrı kalıcılık).

- [ ] **Step 2: `LessonForm`'a bölümü ekle** (içerik alanının altında, düğme satırının üstünde).

- [ ] **Step 3: Doğrula**

Run: `npm run typecheck`
Expected: hatasız.

- [ ] **Step 4: Tarayıcıda dene** (`npm run dev`; `/run` ya da Claude-in-Chrome ile `/admin/kurslar/<id>`): mevcut bir dersi düzenle → küçük bir PDF yükle → listede görünür, ad değiştirilebilir, silinebilir; `.exe` seçilince hata görünür; yeni ders formunda not görünür.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/LessonFilesField.tsx src/components/admin/CourseBuilder.tsx
git commit -m "feat(lesson-files): admin lesson file manager"
```

---

### Task 6: Öğrenci arayüzü — ders sayfasında "Ders dosyaları"

**Files:**
- Create: `src/components/learn/LessonFiles.tsx`
- Modify: `src/app/ogrenim/[slug]/ders/[lessonId]/page.tsx`

**Interfaces:**
- Consumes: `listLessonFiles` (Task 2); `formatFileSize`, `fileExtension` (Task 1).
- Produces: `LessonFiles({ lessonId, files }: { lessonId: number; files: LessonFileItem[] })` — sunucu bileşeni; `files` boşsa `null` döner; her satır `<a href="/api/client/lessons/${lessonId}/files/${f.id}">` (ad, uzantı etiketi büyük harf, boyut). Stil: `LessonComments` ile aynı `card`/`card-kicker` sınıfları + inline style.
- `page.tsx`: `!previewing` ise `listLessonFiles(id)` çağrılır ve `LessonPlayer` ile `LessonComments` arasına `<LessonFiles …/>` konur. `previewing` iken sorgu yapılmaz ve bileşen render edilmez.

- [ ] **Step 1: Bileşeni yaz**, `page.tsx`'e bağla.

- [ ] **Step 2: Doğrula**

Run: `npm run typecheck`
Expected: hatasız.

- [ ] **Step 3: Tarayıcıda dene:** kayıtlı öğrenci olarak dosyası olan derste liste görünür ve tıklayınca indirme başlar; dosyasız derste bölüm yoktur; ücretsiz önizleme dersinde (kursa kayıtsız kullanıcı) bölüm yoktur.

- [ ] **Step 4: Commit**

```bash
git add src/components/learn/LessonFiles.tsx "src/app/ogrenim/[slug]/ders/[lessonId]/page.tsx"
git commit -m "feat(lesson-files): lesson file list for enrolled students"
```

---

### Task 7: Uçtan uca betik ve son doğrulama

**Files:**
- Create: `scripts/test-lesson-files.mjs`
- Modify: `package.json` (`"test:lesson-files"` betiği, `test:programs` ile aynı biçimde `--env-file=.env`)

**Interfaces:**
- Consumes: çalışan `npm run dev` + gerçek DB + gerçek R2; `scripts/test-programs.mjs` iskeleti (`api`, `addUser`, `cookieFor`, `check`, temizlik deseni; kullanıcılar `@example.invalid`, kurs slug'ı `e2e-files-*`). Admin kullanıcı `role='admin'` olarak DB'ye eklenir. R2 nesnesinin varlığı `@aws-sdk/client-s3` `HeadObjectCommand` ile doğrudan kontrol edilir.
- Produces: `npm run test:lesson-files` — her `check` ✓, çıkış kodu hatada ≠ 0.

- [ ] **Step 1: Betiği yaz.** Senaryolar (her biri bir `check`):
  1. Admin: kurs+modül+ders DB'de oluşturulur; `upload` rotası 201 ve imzalı adres döner; engelli (`setup.exe`) 400; `size` 150 MiB üstü 400.
  2. Gerçek `PUT` (küçük bir metin gövdesi) → `POST …/files` 201; kayıtta `size_bytes` `HEAD` boyutuna eşit (istemcinin söylediği değil).
  3. Başka derse ait anahtarla (`dosyalar/<başka id>/…`) ve video anahtarıyla kayıt 400; aynı anahtarın ikinci kaydı 409.
  4. Kayıtlı öğrenci: indirme `302`, `Location` R2 alan adı içerir ve imzalı adrese `fetch` gövdesi yüklenen metne eşit, yanıt `content-disposition` başlığı `attachment` ve özgün adı içerir.
  5. Kayıtsız (girişli) kullanıcı 403; girişsiz 401; ders sayfası HTML'inde `X-Amz-Signature` geçmez.
  6. Dosya ID'si A dersinin, URL B dersinin → 404.
  7. Önizleme dersi: kayıtsız kullanıcı için indirme 403 ve ders sayfasında "Ders dosyaları" yok; kayıtlı öğrenci için sayfada var.
  8. `PATCH` yeniden adlandırma, `DELETE` dosya → R2 `HEAD` 404.
  9. Yeni dosya ekle, **dersi sil** → R2 nesnesi yok; aynısı **modül silme** ve **kurs silme** için.
  10. Temizlik: oluşturulan kullanıcı/kurs satırları ve kalan R2 nesneleri silinir (hata olsa da `finally` içinde).

- [ ] **Step 2: Çalıştır**

Run (iki terminal): `npm run dev` ardından `BASE_URL=http://localhost:3000 npm run test:lesson-files`
Expected: tüm satırlar `✓`, sonda `0 FAIL`.

- [ ] **Step 3: Tüm kontroller**

Run: `npm run typecheck && npm test && npm run build`
Expected: üçü de hatasız.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-lesson-files.mjs package.json
git commit -m "test(lesson-files): end-to-end script"
```

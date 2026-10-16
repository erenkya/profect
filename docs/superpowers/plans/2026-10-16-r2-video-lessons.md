# R2 Video Dersleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ders videolarını yönetici panelinden doğrudan Cloudflare R2'ye yüklemek ve yalnızca kursa erişimi olan oturumlu kullanıcılara, R2 adresi hiç açığa çıkmadan, sitenin kendi video oynatıcısıyla akıtmak.

**Architecture:** Yükleme: admin → `POST /api/admin/uploads/video` (imzalı PUT) → tarayıcı R2'ye doğrudan PUT. Oynatma: `<video src>` aynı origin'deki `GET /api/client/lessons/[lessonId]/video` route handler'ına gider; handler her istekte oturum+kurs erişimi doğrular, R2'den **en fazla 4 MiB'lık** `Range` dilimini okuyup `206` olarak aktarır. Kota sayacı MySQL'de.

**Tech Stack:** Next.js 16.4 App Router (route handler, Node runtime), MySQL (`mysql2`), zod, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, Node `node:test` (TS için `--experimental-strip-types`, Node 22.12).

**Spec:** `docs/superpowers/specs/2026-10-16-r2-video-lessons-design.md`

## Global Constraints

- Next.js 16.4.2: route handler `params` bir `Promise`'tir (`{ params }: { params: Promise<{ lessonId: string }> }`); kod yazmadan önce `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` okundu.
- Bucket herkese kapalı. **Tarayıcıya hiçbir R2 URL'i/imzalı GET verilmez.** Yalnızca admin'e, tek anahtarlık, 10 dk geçerli imzalı PUT verilir.
- Nesne anahtarı: `kurslar/{kurs-slug}/{modül-id}-{modül-başlık-slug}/{rastgele-8-hane}-{ders-başlık-slug}.mp4`; bucket'ta `kurslar/` dışında anahtar üretilmez.
- Yalnızca `video/mp4`, en çok 2 GB (2 147 483 648 bayt).
- Video dilimi üst sınırı **4 MiB (4 194 304 bayt)** — hem Vercel 4,5 MB gövde sınırının altında kalır hem kota sayacını doğru tutar.
- Kota: kullanıcı × ders × gün için video boyutunun 5 katı bayt; aşılırsa `429`. Admin kotadan muaf.
- Her video isteğinde: oturum (`requireUser`) + `canAccessCourse` veya `role=admin` + dersin DB'deki kursu. Yanıt başlıkları: `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Accept-Ranges: bytes`. `Sec-Fetch-Dest: document` veya `Sec-Fetch-Site: cross-site` → `403`.
- Arayüz metinleri Türkçe. `lessons` şeması değişmez; `lessons.content` video derslerde R2 anahtarını tutar. Anahtar istemciye (sayfa props'u dahil) **gönderilmez** (admin paneli hariç).
- Canlı olabilecek uzak DB (`DB_HOST` uzak sunucu): **migration ve `test-api` çalıştırmadan önce kullanıcıdan onay alınır.** Kod commit'leri onaysız yapılır, DB/R2 yazan komutlar yapılmaz.
- Commit mesajları: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` ile biter. Kullanıcı commit istemediği sürece commit atılmaz; kullanıcı "başla" dediği için task sonlarında commit adımı **yapılmaz**, değişiklikler çalışma ağacında birikir (son adımda commit önerilir).

## Review Focus

1. Türkçe/özel karakterli ve boş başlıklar (`"Şık Çğüö!"`, `"???"`) → anahtar yine geçerli ve ASCII (test: `video-key.test.ts`).
2. `Range` uç durumları: `bytes=0-`, `bytes=-500` (son 500), `bytes=999999999-` (dosya sonrası) → `416`, çoklu aralık (`bytes=0-1,5-9`) → `416`, bozuk başlık → `416` (test: `byte-range.test.ts`).
3. Yöneticinin başka modülün/başka kursun anahtarını veya `../` içeren anahtarı ders içeriği olarak göndermesi → `400`.
4. Kayıt süresi biten/başka kursun öğrencisi ve çerezsiz istek → sırasıyla `403` ve `401`; yanıtlarda R2 host adı geçmez.
5. Eski (YouTube ID'li) video dersi → öğrenciye "video henüz yüklenmedi" mesajı, oynatıcı hata vermez.

---

### Task 1: Saf yardımcılar (anahtar üretimi + Range ayrıştırma) ve test altyapısı

**Files:**
- Create: `src/lib/video-key.ts`, `src/lib/byte-range.ts`, `src/lib/video-key.test.ts`, `src/lib/byte-range.test.ts`
- Modify: `package.json` (script `test`), `tsconfig.json` (`allowImportingTsExtensions: true`)

**Interfaces:**
- Produces (`video-key.ts`, hiçbir import yok):
  - `slugify(input: string, fallback: string): string` — küçük harf ASCII, Türkçe harf dönüşümü (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u, İ→i), harf/rakam dışı → `-`, kenar `-` kırpılır, en çok 40 karakter, boşsa `fallback`.
  - `moduleFolder(courseSlug: string, moduleId: number, moduleTitle: string): string` → `kurslar/{courseSlug}/{moduleId}-{slug}/`
  - `buildVideoKey(courseSlug: string, moduleId: number, moduleTitle: string, lessonTitle: string, random: string): string` → `{moduleFolder}{random}-{slugify(lessonTitle,"ders")}.mp4`
  - `randomId(): string` — 8 hane küçük hex (`crypto.getRandomValues`).
  - `isVideoKey(key: string): boolean` — `^kurslar/[a-z0-9-]+/[0-9]+-[a-z0-9-]+/[a-f0-9]{8}-[a-z0-9-]+\.mp4$` ve `..` içermez.
  - `keyInModule(key: string, courseSlug: string, moduleId: number): boolean` — `isVideoKey(key)` ve `kurslar/{courseSlug}/{moduleId}-` ile başlar.
  - `MAX_VIDEO_BYTES = 2147483648`, `VIDEO_CHUNK_BYTES = 4194304`, `QUOTA_MULTIPLIER = 5`.
- Produces (`byte-range.ts`, hiçbir import yok):
  - `type ByteRange = { start: number; end: number }` (ikisi de dahil, bayt indeksi)
  - `parseByteRange(header: string | null, size: number, maxChunk: number): ByteRange | "unsatisfiable"`. `header` yoksa `{0, min(maxChunk,size)-1}`; `bytes=a-`, `bytes=a-b`, `bytes=-n` desteklenir; `end` her zaman `min(end, start+maxChunk-1, size-1)`; `start >= size`, çoklu aralık, bozuk biçim, `start > end` → `"unsatisfiable"`.

- [ ] **Step 1: Test altyapısı.** `package.json` `scripts`'e `"test": "node --experimental-strip-types --disable-warning=ExperimentalWarning --test src/lib/*.test.ts"` ekle; `tsconfig.json`'a `"allowImportingTsExtensions": true` ekle (testler `./video-key.ts` gibi uzantılı import eder).
- [ ] **Step 2: `video-key.test.ts` yaz** (başarısız olmalı): `slugify("Şık Çğüö!", "x") === "sik-cguo"`; `slugify("???", "ders") === "ders"`; `slugify("a".repeat(100), "x").length <= 40`; `buildVideoKey("web-tasarim", 34, "Giriş", "HTML Temelleri", "a1b2c3d4") === "kurslar/web-tasarim/34-giris/a1b2c3d4-html-temelleri.mp4"`; `isVideoKey` o anahtar için `true`; `false`: `"kurslar/../x.mp4"`, `"x/y.mp4"`, `"kurslar/a/1-b/zzzzzzzz-c.mp4"`, `"dQw4w9WgXcQ"`; `keyInModule(anahtar, "web-tasarim", 34) === true`, `(…, "web-tasarim", 3) === false`, `(…, "baska", 34) === false`; `randomId()` 8 hane hex.
- [ ] **Step 3: `byte-range.test.ts` yaz** (başarısız olmalı), `size=10_000_000`, `maxChunk=4_194_304`: başlık yok → `{0, 4194303}`; `bytes=0-` → `{0,4194303}`; `bytes=100-199` → `{100,199}`; `bytes=-500` → `{9999500, 9999999}`; `bytes=9999000-` → `{9999000, 9999999}`; `bytes=10000000-` → `"unsatisfiable"`; `bytes=0-1,5-9`, `bytes=abc`, `bytes=5-2`, `items=0-1` → `"unsatisfiable"`; `bytes=0-99999999` → `{0,4194303}`.
- [ ] **Step 4: Çalıştır, başarısızlığı gör.** Run: `npm test` — Expected: FAIL (modül yok).
- [ ] **Step 5: İki dosyayı yukarıdaki imzalarla uygula.**
- [ ] **Step 6: Run:** `npm test && npm run typecheck` — Expected: tüm testler PASS, typecheck hatasız.

### Task 2: R2 istemci katmanı ve kurulum betiği

**Files:**
- Create: `src/lib/r2.ts`, `scripts/r2-setup.mjs`
- Modify: `package.json` (bağımlılıklar + script `r2:setup`), `.env.example`

**Interfaces:**
- Consumes: `VIDEO_CHUNK_BYTES`, `MAX_VIDEO_BYTES` ← `video-key.ts`
- Produces (`r2.ts`, `import "server-only"`):
  - `presignVideoUpload(key: string, size: number): Promise<{ url: string; headers: Record<string,string> }>` — `PutObject` (ContentType `video/mp4`, ContentLength `size`), 600 sn. `headers` istemcinin PUT'ta göndermesi gerekenleri döner (`Content-Type`).
  - `headVideo(key: string): Promise<{ size: number } | null>` (yoksa `null`)
  - `getVideoRange(key: string, range: { start: number; end: number }): Promise<{ body: ReadableStream<Uint8Array>; start: number; end: number; total: number; contentLength: number }>` — R2'ye `Range: bytes=start-end`; `total` yanıtın `ContentRange` değerinden; gövde `transformToWebStream()`.
  - `deleteVideo(key: string): Promise<void>`, `deleteVideos(keys: string[]): Promise<void>` (1000'lik gruplar), `deletePrefix(prefix: string): Promise<void>` (`ListObjectsV2` + toplu silme). Hepsi hatayı yutup `console.error` ile loglar (çağıranı bozmaz).
- Env: `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`. Endpoint `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` (`CLOUDFLARE_S3_API` kullanılmaz, bucket yolu içerebilir), region `auto`, `requestChecksumCalculation: "WHEN_REQUIRED"`, `responseChecksumValidation: "WHEN_REQUIRED"`.

- [ ] **Step 1:** `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`.
- [ ] **Step 2:** `src/lib/r2.ts`'yi yukarıdaki imzalarla yaz; istemciyi modül düzeyinde tembel (ilk kullanımda) oluştur ki derleme anında env gerekmesin. Eksik env → anlamlı `Error("R2 yapılandırması eksik: <ad>")`.
- [ ] **Step 3:** `scripts/r2-setup.mjs` (`node --env-file=.env`): (a) bucket'a küçük bir test nesnesi `kurslar/_setup-check.txt` yazıp siler ve "yazma yetkisi: OK/YOK" basar; (b) `PutBucketCors` ile yalnızca `PUT` + `Content-Type` başlığı + `ETag` expose, origin'ler = `APP_URL` (sondaki `/` atılmış) ve `http://localhost:3000`; yetki yoksa Cloudflare panelinde yapılacak adımları basar. `package.json`: `"r2:setup": "node --env-file=.env scripts/r2-setup.mjs"`. `.env.example`'a beş R2 değişkenini (değersiz) ekle.
- [ ] **Step 4: Run:** `npm run typecheck` — Expected: hatasız. (`npm run r2:setup` **çalıştırılmaz**; Task 9'da kullanıcı onayıyla.)

### Task 3: Kota sayacı (migration + `consumeVideoQuota`)

**Files:**
- Create: `db/migrations/002_video_stream_usage.sql`, `src/lib/video-quota.ts`

**Interfaces:**
- Consumes: `QUOTA_MULTIPLIER` ← `video-key.ts`; `pool` ← `@/lib/db`
- Produces: `consumeVideoQuota(userId: number, lessonId: number, bytes: number, total: number): Promise<boolean>` — o günkü sayaç `>= QUOTA_MULTIPLIER * total` ise `false` (artırmaz); aksi halde `bytes` ekler ve `true`.
- Tablo: `video_stream_usage(user_id INT UNSIGNED, lesson_id INT UNSIGNED, day DATE, bytes BIGINT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (user_id, lesson_id, day), FK → users/lessons ON DELETE CASCADE)`, `CREATE TABLE IF NOT EXISTS`, `ENGINE=InnoDB utf8mb4` (001 ile aynı biçim).

- [ ] **Step 1:** Migration dosyasını yaz (yalnızca ekleme; mevcut tabloya dokunmaz).
- [ ] **Step 2:** `consumeVideoQuota`'yu `SELECT bytes … WHERE day = CURDATE()` + `INSERT … ON DUPLICATE KEY UPDATE bytes = bytes + ?` ile uygula.
- [ ] **Step 3: Run:** `npm run typecheck` — Expected: hatasız. (**`npm run db:migrate` çalıştırılmaz** — uzak DB; Task 9'da onayla.)

### Task 4: Yükleme başlatma API'si ve ders kaydı doğrulaması

**Files:**
- Create: `src/app/api/admin/uploads/video/route.ts`
- Modify: `src/lib/admin-schemas.ts` (`lessonSchema`, yeni `videoUploadSchema`), `src/app/api/admin/modules/[moduleId]/lessons/route.ts`, `src/app/api/admin/lessons/[lessonId]/route.ts`, `src/lib/lms.ts` (`extractVideoId` silinir; `getModuleForKey(moduleId): Promise<{ id: number; title: string; course_slug: string } | null>` eklenir)

**Interfaces:**
- Consumes: `buildVideoKey`, `randomId`, `keyInModule`, `isVideoKey`, `MAX_VIDEO_BYTES` ← `video-key.ts`; `presignVideoUpload`, `headVideo`, `deleteVideo` ← `r2.ts`
- Produces: `POST /api/admin/uploads/video` gövde `{ module_id: number, lesson_title: string, content_type: "video/mp4", size: number }` → `201 { success, key, upload: { url, headers } }`; `size > MAX_VIDEO_BYTES` veya `content_type` ≠ `video/mp4` → `400`; modül yok → `404`; admin değilse `401/403` (`requireAdmin`).
- `lessonSchema.content`: `lesson_type === "video"` ise `isVideoKey` zorunlu (`superRefine`), metinde serbest. Ders POST/PATCH video için: `keyInModule(content, course_slug, moduleId)` değilse `400 "Geçersiz video."`; `headVideo(content)` `null` ise `400 "Video R2'de bulunamadı."`. PATCH'te yeni anahtar eskisinden farklıysa ve eski bir `isVideoKey` ise kayıt sonrası `deleteVideo(eski)`; ders tipi videodan metne dönerse eski silinir.

- [ ] **Step 1:** Eksik testler için `scripts/test-api.mjs`'e Task 9'da eklenecek senaryoları şimdiden başlık olarak not al (kod yok); bu task'ın doğrulaması typecheck + `npm test` + Task 9.
- [ ] **Step 2:** `videoUploadSchema`, `lessonSchema` değişikliği ve `getModuleForKey` (modül + kurs slug'ı tek sorguda) uygula; `extractVideoId` ve importlarını sil.
- [ ] **Step 3:** `POST /api/admin/uploads/video` route'unu yaz (anahtar `buildVideoKey(..., randomId())`).
- [ ] **Step 4:** Lessons POST/PATCH'e video doğrulaması ve eski nesne silmeyi ekle.
- [ ] **Step 5: Run:** `npm run typecheck && npm test` — Expected: hatasız / PASS.

### Task 5: Silmede R2 temizliği

**Files:**
- Modify: `src/app/api/admin/lessons/[lessonId]/route.ts` (DELETE), `src/app/api/admin/modules/[moduleId]/route.ts` (DELETE), `src/app/api/admin/courses/[courseId]/route.ts` (DELETE)

**Interfaces:**
- Consumes: `deleteVideo`, `deleteVideos`, `deletePrefix` ← `r2.ts`; `isVideoKey` ← `video-key.ts`
- Davranış: Her DELETE önce DB'den ilgili video anahtarlarını (`lesson_type='video'` ve `isVideoKey`) okur, DB kaydını siler, **başarılıysa** R2'yi temizler (hata → loglanır, yanıt başarılı). Ders → `deleteVideo`; modül → `deleteVideos`; kurs → `deletePrefix("kurslar/{slug}/")`.

- [ ] **Step 1:** Üç DELETE'i yukarıdaki sırayla güncelle (mevcut yetki/doğrulama dokunulmaz).
- [ ] **Step 2: Run:** `npm run typecheck` — Expected: hatasız.

### Task 6: Akış (stream) route'u

**Files:**
- Create: `src/app/api/client/lessons/[lessonId]/video/route.ts`

**Interfaces:**
- Consumes: `requireUser` ← `@/lib/auth`; `getLesson`, `canAccessCourse` ← `@/lib/lms`; `parseByteRange`; `isVideoKey`, `VIDEO_CHUNK_BYTES` ← lib; `getVideoRange`, `headVideo` ← `r2.ts`; `consumeVideoQuota`
- Produces: `GET`, `export const runtime = "nodejs"`, `export const maxDuration = 60`. Sıra: Sec-Fetch kontrolü (`403`) → `requireUser` (`401`) → `parseId` (`400`) → `getLesson` (yoksa/`video` değilse/anahtar `isVideoKey` değilse `404`) → admin değilse `canAccessCourse` (`403`) → boyut: `Range` varsa `headVideo` ile `size` (`404` yoksa) → `parseByteRange` (`"unsatisfiable"` → `416` + `Content-Range: bytes */size`) → `getVideoRange` → admin değilse `consumeVideoQuota(user.id, lesson.id, contentLength, total)` `false` ise `429` (gövde iptal edilir `body.cancel()`) → `206` (başlık yoksa da `206`, `Content-Range: bytes s-e/total`), `Content-Length`, `Content-Type: video/mp4`, Global Constraints'teki başlıklar. `HEAD` desteklenmez (Next otomatik).

- [ ] **Step 1:** Route'u yaz; hata mesajları Türkçe JSON (`fail`), video başarısında düz akış.
- [ ] **Step 2: Run:** `npm run typecheck` — Expected: hatasız. (Uçtan uca doğrulama Task 9.)

### Task 7: Oynatıcı ve ders sayfası

**Files:**
- Modify: `src/components/learn/LessonPlayer.tsx`, `src/app/ogrenim/[slug]/ders/[lessonId]/page.tsx`, `README.md` (ilerleme satırı)

**Interfaces:**
- Consumes: `isVideoKey` ← `video-key.ts`
- Produces: `LessonPlayer` props: `content` **kaldırılır** (video için); yeni `videoReady: boolean`, `markdown: string` (metin dersi için), `watermark: string` ("Ad Soyad · e-posta"). Sayfa, `lesson_type === "video"` iken `videoReady = isVideoKey(lesson.content)` hesaplar ve **anahtarı props'a koymaz**; metin dersinde `markdown = lesson.content`.
- Davranış: `<div ref>` kapsayıcısı içinde `<video src="/api/client/lessons/{id}/video" controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsInline preload="metadata" onContextMenu={e=>e.preventDefault()}>` + yarı saydam, `pointer-events:none`, 20 sn'de bir konum değiştiren filigran (`position:absolute`); tam ekran düğmesi kapsayıcıyı `requestFullscreen` eder (native video tam ekranı filigranı gizlediği için `controlsList` içine `nofullscreen` eklenir ve özel "Tam ekran" düğmesi konur). `ended` veya `timeupdate` oranı ≥ 0.95 → mevcut `markComplete()`. `onError`: önce `fetch` ile aynı adrese `Range: bytes=0-0` atıp durum kodunu oku → `401` "Oturumun sona erdi, yeniden giriş yap.", `403` "Bu kursa erişimin yok.", `429` "Çok fazla izleme isteği; daha sonra tekrar dene.", diğer "Video yüklenemedi." Metin kutusu hata yerine `role="alert"`. `videoReady === false` → "Bu dersin videosu henüz yüklenmedi." YouTube IFrame kodu, Vimeo iframe'i ve elle "Dersi tamamladım" düğmesi silinir.

- [ ] **Step 1:** `LessonPlayer`'ı yeniden yaz (metin dersi mantığı aynen kalır).
- [ ] **Step 2:** Sayfayı yeni props ile güncelle (`user.full_name` + `user.email` → `watermark`); README'deki "YouTube videosu bitince/%95'te" satırını güncelle.
- [ ] **Step 3: Run:** `npm run typecheck` — Expected: hatasız.

### Task 8: Yönetici yükleme arayüzü

**Files:**
- Create: `src/components/admin/VideoUploadField.tsx`
- Modify: `src/components/admin/CourseBuilder.tsx` (`LessonForm`, satır ~198-225)

**Interfaces:**
- Consumes: `POST /api/admin/uploads/video` (Task 4); mevcut `src/components/admin/api.ts` yardımcıları (okunarak kullanılır)
- Produces: `VideoUploadField({ moduleId, lessonTitle, value, onChange, onDuration }: { moduleId: number; lessonTitle: string; value: string; onChange: (key: string) => void; onDuration: (minutes: number) => void })` — dosya seçici/sürükle-bırak (yalnızca `.mp4`, 2 GB), `XMLHttpRequest` ile R2'ye PUT (`upload.onprogress` → yüzde çubuğu), hata → "Tekrar dene". Yükleme bitince `onChange(key)`; dosyadan `loadedmetadata` ile süre okunup `Math.max(1, Math.round(sn/60))` ile `onDuration`. Mevcut `value` varsa "Video yüklendi ✓ · Değiştir". `LessonForm`'da video türünde bağlantı kutusunun yerine bu alan; yükleme sürerken "Kaydet" devre dışı; form iptalinde yüklenmiş ama kaydedilmemiş anahtar için sunucuda silme çağrısı yok (spec: best effort → yükleme-iptal uç noktası YAGNI; README'de R2 lifecycle notu).

- [ ] **Step 1:** Bileşeni yaz, `LessonForm`'a bağla (ders yeniyse `moduleId` prop'u `LessonForm`'a eklenir).
- [ ] **Step 2: Run:** `npm run typecheck` — Expected: hatasız.
- [ ] **Step 3: Elle kontrol** (`npm run dev`, admin girişi gerekir — kullanıcıdan): modülde video ders ekle → çubuk ilerler → kaydet → ders listesinde video ikonu.

### Task 9: Uçtan uca test, kurulum belgeleri ve canlı doğrulama

**Files:**
- Modify: `scripts/test-api.mjs`, `README.md`, `.env.example` (Task 2'de eklendiyse dokunma)

**Interfaces:** Consumes tüm uç noktalar.

- [ ] **Step 1: `test-api.mjs`'i güncelle.** Satır ~33-37'deki YouTube senaryosunu kaldır; yerine: `POST /api/admin/uploads/video` (400: boyut > 2 GB, 400: `content_type` farklı, 201: anahtar `kurslar/{slug}/…mp4` ve `upload.url` döner); imzalı URL'e 1 KB sahte `video/mp4` PUT; `POST …/lessons` ile `content=key` (201) ve `content="dQw4w9WgXcQ"` (400) ve başka modül klasörlü/`../` anahtarı (400); video adresi: çerezsiz `401`, kayıtsız öğrenci `403`, kayıtlı öğrenci `Range: bytes=0-99` ile `206` + `Content-Range: bytes 0-99/1024`, `bytes=5000-` `416`, yanıt başlık/gövdesinde `r2.cloudflarestorage.com` geçmez; dersi silince R2 nesnesi gerçekten gitmiş (`DELETE` sonrası video adresi `404`).
- [ ] **Step 2: README.** R2 kurulumu: gerekli env değişkenleri, `npm run r2:setup`, "kapalı bucket kontrol listesi" (r2.dev kapalı, herkese açık alan adı yok, token yalnızca bu bucket + Object Read&Write), R2 lifecycle önerisi (yarım/kaydedilmemiş yüklemeler için), kabul edilen sınırlar (ekran kaydı; maliyet).
- [ ] **Step 3 [KULLANICI ONAYI GEREKİR]:** Kullanıcıya şunu sor: "`.env`'deki DB uzak sunucuda (canlı olabilir). `002_video_stream_usage.sql` yalnızca yeni bir tablo ekler. `npm run db:migrate` çalıştırayım mı? `npm run r2:setup` bucket'a küçük bir test nesnesi yazıp silecek ve CORS ayarlayacak; çalıştırayım mı?" Onay gelirse çalıştır.
- [ ] **Step 4 [KULLANICI ONAYI + ADMIN BİLGİSİ GEREKİR]:** `npm run dev` ardından `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run test:api` (test verisini kendisi siler). Çıktıda tüm satırlar ✓ olmalı.
- [ ] **Step 5 [KULLANICI ELLE]:** Vercel **preview** dağıtımında ≥250 MB'lık bir MP4 yükle ve izle: ileri sarma çalışmalı, tarayıcı Network sekmesinde yalnızca `…/video` (aynı origin) istekleri, hiç `r2.cloudflarestorage.com` olmamalı; her yanıt ≤ 4 MiB `206`. Vercel Function loglarında hata/zaman aşımı olmamalı.
- [ ] **Step 6:** `npm run typecheck && npm test && npm run build` — Expected: hepsi hatasız. Değişiklikleri özetle ve commit öner.

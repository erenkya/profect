# Ders Dosyaları (indirilebilir ekler) — Tasarım

Tarih: 2026-11-03 · Durum: onay bekliyor

## Amaç ve neden

Eğitmenler derslerde sunum (PPTX/PDF), kod ve benzeri dosyaları öğrencilerle paylaşmak istiyor. Bugün bunun bir yolu yok: bir ders yalnızca bir video ya da Markdown metin. Yönetici, **tek tek derse** birden fazla dosya ekleyebilmeli; **yalnızca o kursa erişimi olan öğrenciler** bu dosyaları ders sayfasından indirebilmeli.

## Hedefler

- Her derse (video ya da metin fark etmez) 0..N dosya eklenebilir; yönetici dosyaya görünen bir ad verir.
- Öğrenci, ders sayfasında oynatıcının altında "Ders dosyaları" listesini görür (ad, tür, boyut) ve tıklayınca indirir.
- Erişim kuralı video ile aynıdır: oturum + `canAccessCourse` (kayıt satırı ya da aktif Plus). Yönetici her dosyaya erişir.
- Linki/ID'yi bilmek yetmez: kayıtsız biri dosyayı alamaz.
- Ders, modül ya da kurs silinince dosyaların R2 nesneleri de silinir.

## Hedef olmayanlar (v1)

- **Ücretsiz önizleme derslerinde dosya yok.** Kayıtlı olmayanlar (girişsiz dahil) dosya listesini görmez. Karar: kullanıcı ("sadece kursa kayıtlı öğrenciler").
- Kurs düzeyinde dosya (yalnızca ders düzeyi). Karar: kullanıcı.
- İndirme sayısı sınırı/kotası (videodaki günlük kota yok). Karar: kullanıcı onayladı.
- İndirme istatistiği, sürümleme, klasör, virüs taraması, dosya sıralamayı sürükle-bırak (liste yüklenme sırasıyla gelir).
- Eğitmen (admin olmayan) rolünün dosya yüklemesi: yönetim paneli zaten yalnızca yöneticiye açık, bu değişmez.
- Sınav (quiz) ekranlarında dosya.

## Anti-hedefler (çalışsa bile başarısızlık sayılır)

- Kursa kayıtlı olmayan (ya da girişsiz) birinin, dosya ID'sini tahmin ederek ya da başkasının linkiyle dosyayı indirebilmesi.
- Başka dersin dosyasının, URL'deki ders/dosya ID'si karıştırılarak indirilebilmesi (dosya, URL'deki derse ait değilse 404).
- İmzalı R2 adresinin ders sayfası HTML'inde ya da API listesinde bulunması (adres yalnızca indirme isteğinde, anlık üretilir).
- Ders/modül/kurs silindiğinde R2'de sahipsiz dosya kalması.
- Yürütülebilir dosyaların (.exe vb.) yüklenebilmesi.

## Kısıtlar ve mevcut yapı

Next.js 16 — `AGENTS.md`: kod yazmadan önce `node_modules/next/dist/docs/` içindeki ilgili kılavuz (route handlers, redirect/headers) okunur. MySQL/`mysql2` düz SQL, ORM yok. Tüm kullanıcı metinleri Türkçe. UI'da bileşen kütüphanesi yok; `ds.css`/`globals.css` sınıfları + inline style.

Yeniden kullanılacak mevcut parçalar:

- **Depolama:** `src/lib/r2.ts` — mevcut `R2_BUCKET` (kurs videoları/kapaklar). Yeni bucket gerekmez. Yükleme deseni: yönetici `POST` ile imzalı PUT alır, tarayıcı doğrudan R2'ye `PUT` eder (`VideoUploadField.tsx` `XMLHttpRequest` + ilerleme çubuğu). R2 CORS kuralı bugün yalnızca `PUT` + `Content-Type` başlığına izin veriyor (`scripts/r2-setup.mjs`) — bu akış için yeterli. İndirme tarayıcı navigasyonu olduğu için CORS gerektirmez.
- **Anahtar deseni:** `src/lib/video-key.ts`, `cover-key.ts` — saf fonksiyonlar, `src/lib/*.test.ts` altında Node testi (`npm test`).
- **Erişim:** `canAccessCourse`, `getLesson` (`src/lib/lms.ts`); `requireUser`/`requireAdmin` (`src/lib/auth.ts`). Video rotası `src/app/api/client/lessons/[lessonId]/video/route.ts` referans yetki akışıdır (ancak önizleme istisnası **dosyalarda yoktur**).
- **Silme:** ders/modül/kurs silme rotaları `listVideoKeys(scope, id)` ile R2 anahtarlarını **cascade'den önce** toplayıp sonra `deleteVideos` çağırıyor (`api/admin/lessons/[lessonId]`, `modules/[moduleId]`, `courses/[courseId]`). Dosyalar için aynı üç noktaya eşdeğeri eklenir.
- **Admin ders formu:** `CourseBuilder.tsx` içindeki `LessonForm`; ağaç verisi `getCourseAdminTree` / `AdminLesson`.
- **Ders sayfası:** `src/app/ogrenim/[slug]/ders/[lessonId]/page.tsx` — `previewing` değişkeni kayıtsız kullanıcıyı belirler.
- Migration: `db/migrations/NNN_*.sql`; son numara 018, bu iş **019** (uygularken `ls db/migrations` ile doğrula). `npm run db:migrate`.
- Vercel fonksiyon istek/yanıt gövdesi sınırı 4,5 MB'dır; 150 MB'lık dosya uygulama sunucusundan akıtılamaz. Bu yüzden indirme, R2'ye kısa ömürlü imzalı yönlendirme olarak yapılır (aşağıda).

## Tasarım

### Veri (migration 019)

Yeni `lesson_files` tablosu:

| Alan | Not |
|---|---|
| `id` | PK |
| `lesson_id` | FK → `lessons.id`, `ON DELETE CASCADE`, indeksli |
| `title` | görünen ad, 1–120 karakter |
| `file_name` | yüklenen özgün dosya adı (indirmede önerilen ad); temizlenmiş, en çok 255 karakter |
| `storage_key` | R2 anahtarı, UNIQUE |
| `size_bytes` | `BIGINT UNSIGNED` (R2 `HEAD` ile doğrulanmış gerçek boyut) |
| `content_type` | MIME (istemciden gelen, bilgi amaçlı; indirmede `application/octet-stream` + `attachment` kullanılır) |
| `created_at` | |

Liste sırası `created_at, id`.

### R2 anahtarı

`dosyalar/<lessonId>/<8 hex rastgele>-<ascii-slug(dosya adı)>.<uzantı>` — `slugify` mevcut `video-key.ts`'ten yeniden kullanılır. Yeni saf modül `src/lib/lesson-file.ts`: anahtar üretme/doğrulama (`isLessonFileKey`, `keyForLesson`), `MAX_LESSON_FILE_BYTES = 157_286_400` (150 MiB), engellenen uzantı listesi (`.exe .msi .bat .cmd .com .scr .sh .ps1 .vbs .jar .app .dmg .apk`), boyut biçimleme yardımcısı. Node testleri yazılır.

### Yönetici akışı

Dosyalar **yalnızca var olan bir dersin düzenleme formunda** eklenir; yeni ders oluşturulurken form "Dosyaları ders kaydedildikten sonra ekleyebilirsiniz" notu gösterir (builder'a bırakılan alternatif: önce dersi kaydet, sonra aç — ama yukarıdaki yeterlidir).

1. `POST /api/admin/lessons/[lessonId]/files/upload` (`requireAdmin`): gövde `{ file_name, size }`; uzantı engel listesinde mi, `size` 1..150 MiB mi, ders var mı doğrulanır; anahtar üretilir, imzalı PUT (10 dk) döner. `ContentType` **`application/octet-stream`** olarak imzalanır (istemciye MIME'a güvenilmez).
2. Tarayıcı `PUT` eder (ilerleme çubuğu, iptal).
3. `POST /api/admin/lessons/[lessonId]/files` `{ key, title, file_name, content_type }`: anahtar bu derse ait biçimde mi (`keyForLesson`), R2'de `HEAD` ile var mı kontrol edilir; **boyut `HEAD`'den alınır** (istemciye güvenilmez, 150 MiB aşılırsa nesne silinip 400). Satır eklenir.
4. `PATCH /api/admin/lesson-files/[fileId]` yalnızca `title` günceller.
5. `DELETE /api/admin/lesson-files/[fileId]`: satır silinir, R2 nesnesi silinir (hata loglanır, istemciyi bozmaz — `deleteVideo` deseni).

Ders formunda "Dosyalar" bölümü: mevcut dosya listesi (ad, boyut, Sil/Yeniden adlandır), altında sürükle-bırak / seç alanı (`VideoUploadField` düzeninde, çoklu seçim; dosyalar sırayla yüklenir). Liste verisi `getCourseAdminTree` içindeki `AdminLesson`'a `files` olarak eklenir.

Ders/modül/kurs silme: üç rotada, silmeden **önce** ilgili `lesson_files.storage_key`'ler toplanır (`listLessonFileKeys(scope, id)`, `listVideoKeys` ile aynı şekilde), silme sonrası R2'den toplu silinir.

Yarım kalan yüklemeler (PUT oldu ama kayıt adımı olmadı) R2'de sahipsiz kalabilir; v1'de kabul edilir (builder'ın takdiri: gerekirse sonradan temizlik betiği).

### Öğrenci akışı

- **Liste:** ders sayfası sunucuda (`page.tsx`), `!previewing` ise (kayıtlı öğrenci ya da yönetici) `listLessonFiles(lessonId)` çağırır; yeni `LessonFiles` bileşeni oynatıcının altında, yorumların üstünde gösterir. Dosya yoksa bölüm hiç çıkmaz. Listede **imzalı adres yoktur**, yalnızca `/api/client/lessons/[lessonId]/files/[fileId]` bağlantısı.
- **İndirme:** `GET /api/client/lessons/[lessonId]/files/[fileId]`:
  1. `requireUser` (girişsiz → 401).
  2. Dosya `fileId` ve `lessonId` ile birlikte sorgulanır (eşleşmezse 404); ders → kurs.
  3. Yönetici ya da `canAccessCourse(user, course)`; değilse 403. **`isPreviewLesson` istisnası uygulanmaz.**
  4. R2'den `ResponseContentDisposition: attachment; filename*=UTF-8''…` ve `ResponseContentType: application/octet-stream` ile **60 sn geçerli imzalı GET** üretilir, `302` ile yönlendirilir. `Cache-Control: private, no-store`.
- Bağlantı normal `<a href>` olur (tarayıcı navigasyonu); çerez gittiği için oturum kontrolü çalışır.

### Dosya türü sınırlaması

Tür beyaz listesi yok; yukarıdaki yürütülebilir uzantı kara listesi (büyük/küçük harf duyarsız, çift uzantıda son uzantı) hem istemcide hem sunucuda (`upload` ve kayıt adımında) kontrol edilir. İndirmede her zaman `attachment` + `octet-stream` olduğundan tarayıcıda içerik satır içi açılmaz (HTML/SVG yüklense bile XSS yok).

## Doğrulama

- `src/lib/lesson-file.test.ts`: anahtar üretimi/doğrulaması, ders eşleşmesi, engellenen uzantılar, boyut sınırı, ad temizleme.
- Elle/betikle: yönetici yükle → öğrenci (kayıtlı) indirir; kayıtsız ve girişsiz 403/401; başka dersin dosya ID'si 404; önizleme dersinde kayıtsız kullanıcı liste göremez ve indiremez; ders silinince R2'de nesne kalmaz.
- `npm run typecheck` ve `npm test` temiz olmalı.

## Builder'a bırakılanlar

Bileşenlerin tam görsel düzeni, hata/boş durum metinleri, dosya türü ikonları, `getCourseAdminTree` sorgu biçimi, test betiği (`scripts/test-*.mjs` deseni) eklenip eklenmeyeceği, sahipsiz R2 nesneleri için temizlik.

## Benim kararlarım (kullanıcı onayına açık)

- Dosya başına sınır 150 MiB (kullanıcı "100 MB'a kadar" dedi).
- Yürütülebilir uzantı kara listesi, beyaz liste yok.
- Görünen ad + özgün dosya adı ayrı tutulur.
- Dosya ekleme yalnızca kaydedilmiş derslerde.
- İndirme: kısa ömürlü imzalı R2 yönlendirmesi (Vercel gövde sınırı yüzünden).
- Aktif Plus üyeleri, kurs erişimi olduğu için dosyaları da indirebilir (`canAccessCourse` davranışı).

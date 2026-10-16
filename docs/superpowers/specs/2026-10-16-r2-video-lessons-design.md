# Ders videolarını Cloudflare R2'ye taşıma — Tasarım

Tarih: 2026-10-16

## Amaç ve neden

Profect'te video dersler şu an YouTube/Vimeo ID'si olarak tutuluyor; yönetici panelinde sadece bir bağlantı kutusu, öğrenci tarafında YouTube/Vimeo iframe'i var. Kurslar **kapalı ve paralı** olduğu için içerik üçüncü taraf bir platforma bağımlı kalmamalı, kendi kontrolümüzdeki bir depoda durmalı.

Hedef: ders videoları yönetici panelinden **doğrudan Cloudflare R2'ye yüklenir**, sadece kursa kayıtlı öğrenciler (ve yöneticiler) **sitenin kendi video oynatıcısıyla** izler. YouTube/Vimeo desteği tamamen kalkar.

## Hedefler

1. Yönetici, video dersi eklerken/düzenlerken bir MP4 dosyası seçip yükleyebilir; ilerleme çubuğu görür.
2. Bucket **kurs → modül → ders** şeklinde iç içe, düzenli bir klasör yapısında kalır; bucket içinde karmaşa olmaz.
3. Bucket herkese kapalıdır ve **hiçbir R2 adresi/imzalı bağlantı tarayıcıya verilmez**. Video yalnızca giriş yapmış, kursa erişimi olan kullanıcıya, sitenin kendi adresi üzerinden (oturum çerezi doğrulanarak) akıtılır. Bir video adresini kopyalayıp başkasına veren kişi, karşı taraf o hesapla giriş yapmadığı sürece hiçbir şey izletemez.
4. Oynatıcı kendi `<video>` oynatıcısıdır; ilerleme/tamamlanma mantığı (bitiş veya %95) korunur.
5. Ders, modül veya kurs silinince/video değişince R2'de sahipsiz (orphan) dosya kalmaz (normal akışlarda).

## Hedef olmayanlar

- DRM. Ödeme yapmış, giriş yapmış bir öğrencinin ekran kaydı alması veya kendi oturumuyla dosyayı araçlarla indirmesi **teknik olarak tamamen engellenemez**. Bunun yerine caydırıcı katmanlar eklenir (§5: kullanıcıya özel filigran, kullanım kotası, kayıt/log). Bağlantı paylaşımı ve yetkisiz erişim ise engellenir. Daha güçlü koruma (şifreli HLS / Cloudflare Stream imzalı token + DRM) ileride ayrı bir iş olarak değerlendirilebilir.
- Video dönüştürme / HLS / çoklu çözünürlük. 15 dakikalık MP4 doğrudan akıtılır (HTTP range ile ileri sarma çalışır).
- İzleme konumunu hatırlama ("kaldığın yerden devam"), altyazı, kalite seçici.
- YouTube/Vimeo ile ikili çalışma. Eski YouTube/Vimeo dersleri için geçiş aracı yazılmaz.

## Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- Bucket'ı veya video URL'lerini herkese açık yapmak.
- Yüklemenin Next.js sunucusundan geçmesi (Vercel gibi ortamlarda istek gövdesi 4,5 MB ile sınırlı, videolar ≥250 MB). Yükleme doğrudan tarayıcıdan R2'ye gider.
- Öğrenciye/tarayıcıya R2 imzalı GET bağlantısı, `r2.dev` adresi veya herkese açık özel alan adı vermek. (Kopyalanıp paylaşılabilir.)
- Kayıtlı olmayan kullanıcıya, süresi/ödemesi biten hesaba veya başka kursun öğrencisine video akıtmak.
- R2 gizli anahtarlarını tarayıcıya sızdırmak.

## Girdiler / mevcut durum

- Stack: Next.js (App Router, sürüm 16.x — **kod yazmadan önce `node_modules/next/dist/docs/` okunmalı**, AGENTS.md), MySQL (`mysql2`), TypeScript, zod. UI Türkçe.
- R2 `.env` içinde hazır ve **okuma/listeleme erişimi doğrulandı**: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_S3_API`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Bucket şu an boş. Yazma yetkisi ve bucket CORS durumu **henüz doğrulanmadı**.
- `lessons` tablosu: `lesson_type ENUM('video','text')`, `content MEDIUMTEXT NOT NULL` (video için YouTube/Vimeo ID'si). `modules`'te slug yok, sadece `title`; `courses`'ta benzersiz `slug` var.
- Mevcut dosyalar: `src/components/learn/LessonPlayer.tsx`, `src/components/admin/CourseBuilder.tsx` (`LessonForm`), `src/app/api/admin/modules/[moduleId]/lessons/route.ts`, `src/app/api/admin/lessons/[lessonId]/route.ts`, `src/lib/lms.ts` (`extractVideoId`, `getLesson`), `src/lib/admin-schemas.ts` (`lessonSchema`), `src/app/ogrenim/[slug]/ders/[lessonId]/page.tsx`, `scripts/test-api.mjs`, `README.md`.
- Erişim kontrolü bugün `src/app/ogrenim/[slug]/layout.tsx` içinde (`canAccessCourse` veya admin). Yeni video endpoint'i bunu **kendisi de** kontrol etmeli.

## Kararlar (kullanıcının dediği)

- Videolar ~15 dk, en az ~250 MB.
- Kurslar kapalı ve paralı; yalnızca erişimi olanlar izler.
- YouTube'dan gösterilmeyecek, videolar sisteme yüklenecek.
- R2'de her kurs ve kursun her modülü için iç içe klasör düzeni olacak.

## Tasarım

### 1. Nesne anahtarı (klasör) düzeni — *benim kararım*

```
kurslar/{kurs-slug}/{modül-id}-{modül-başlık-slug}/{rastgele-8-hane}-{ders-başlık-slug}.mp4
```

Örnek: `kurslar/web-tasarim/34-giris/a1b2c3d4-html-temelleri.mp4`

- Kurs slug'ı mevcut `courses.slug`; modül ve ders başlıkları ASCII slug'a çevrilir (Türkçe karakterler dönüştürülür: ç→c, ş→s …), boş kalırsa `modul`/`ders` kullanılır.
- Modül klasörüne `id` eklenir ki aynı başlıklı iki modül çakışmasın. Ders adına rastgele önek eklenir çünkü yükleme, ders kaydı oluşmadan **önce** olur (ders id'si henüz yok).
- Anahtarın tamamı DB'de saklanır; kurs/modül/ders yeniden adlandırılırsa dosya taşınmaz, DB'deki yol geçerli kalır (klasör adı eski kalır, bu kabul).
- Bucket'ın en üst düzeyinde başka bir şey olmaz (`kurslar/` dışında anahtar üretilmez).

### 2. Veri modeli

`lessons.content` kolonu video derslerde artık **R2 nesne anahtarını** tutar (`kurslar/...`). `lessons` şeması değişmez (kota sayacı için ayrı yeni tablo: §5.6). `content` `kurslar/` ile başlamayan eski video dersleri "Video yüklenmemiş" durumunda sayılır: öğrenciye "Bu dersin videosu henüz yüklenmedi" mesajı, yöneticiye yeniden yükleme çağrısı gösterilir. `extractVideoId` ve YouTube/Vimeo ayıklama kodu silinir; `lessonSchema` video için içerik anahtarı biçimini (`kurslar/` önekli) doğrular, yönetici kendi gönderdiği rastgele bir anahtarı kabul ettirememelidir (bkz. §3 adım 4).

### 3. Yükleme akışı

1. Yönetici `LessonForm`'da tür olarak "Video" seçer; bağlantı kutusu yerine dosya seçici/sürükle-bırak alanı görünür. Yalnızca `video/mp4`, en çok 2 GB — *benim kararım*.
2. Tarayıcı `POST /api/admin/uploads/video` çağırır (sadece admin): `{ module_id, lesson_title, file_name, content_type, size }`. Sunucu anahtarı üretir (§1) ve **imzalı PUT URL'i** döner. Bu URL yalnızca o tek anahtara yazar, `Content-Type` (ve mümkünse `Content-Length`) imzaya dahildir, 10 dakika geçerlidir ve sadece admin alır. (Yazma bağlantısı öğrenciye hiç verilmez.)
3. Tarayıcı dosyayı `XMLHttpRequest` ile doğrudan R2'ye `PUT` eder; `upload.onprogress` ile ilerleme çubuğu. Hata olursa "Tekrar dene" düğmesi (baştan yükler) — *benim kararım: çok parçalı (multipart) yükleme yok; tek PUT yeterli.*
4. Yükleme bitince form, dersi mevcut `POST /api/admin/modules/:id/lessons` ya da `PATCH /api/admin/lessons/:id` ile kaydeder; `content` = anahtar. Sunucu bu kayıtta, anahtarın o modülün kurs/modül klasörüyle başladığını ve nesnenin R2'de gerçekten var olduğunu (HEAD) doğrular.
5. Süre (`duration_minutes`) boşsa, dosya tarayıcıda `loadedmetadata` ile okunup otomatik doldurulur (düzenlenebilir) — *benim kararım.*
6. Var olan bir dersin videosu değiştirilirse, kayıt başarılı olduktan sonra eski nesne silinir. Form kaydedilmeden iptal edilirse yüklenen nesne silinmeye çalışılır (best effort); kalanlar için R2 lifecycle kuralı (yarım multipart/eski dosyalar) tavsiye notu README'ye yazılır.

### 4. Silme / temizlik

- Ders silinince (`DELETE /api/admin/lessons/:id`) nesnesi silinir.
- Modül silinince (cascade) modüldeki video nesneleri silinir; kurs silinince `kurslar/{slug}/` altındaki nesneler silinir. Silme sırası: önce DB'den anahtarları oku, DB kaydını sil, sonra R2'den sil (R2 hatası kullanıcıya hata yaptırmaz, loglanır).
- Bütün R2 işlemleri `src/lib/r2.ts` (yeni, `server-only`) içinde toplanır: istemci oluşturma, anahtar üretme/doğrulama, yönetici yüklemesi için imzalı PUT, sunucu içi aralıklı (Range) GET, HEAD, silme.

### 5. Oynatma ve erişim güvenliği

**Prensip:** Tarayıcı R2'yi hiç görmez. Video, uygulamanın kendi adresinden, her istekte oturum doğrulanarak akıtılır (sunucu R2'den okuyup aktarır).

`GET /api/client/lessons/[lessonId]/video` (Node.js runtime, route handler):

1. **Kimlik:** `profect_auth_token` HttpOnly çerezi doğrulanır ve hesabın DB'de hâlâ aktif olduğu kontrol edilir (mevcut `requireAuth`/`getAuthFromCookies` desenleri). Yoksa `401`.
2. **Yetki:** `canAccessCourse(user.id, course.id)` **veya** `role = admin`. Ders, URL'deki değil DB'deki kursa göre çözülür; video tipi ve geçerli bir `kurslar/` anahtarı olmalı. Yoksa `403`/`404`. Her `Range` isteğinde bu kontroller **tekrarlanır** (süresi biten abonelik anında etkili olur).
3. **Range desteği:** `Range: bytes=…` başlığı R2 `GetObject`'e aktarılır; `206 Partial Content`, `Content-Range`, `Accept-Ranges: bytes`, `Content-Length`, `Content-Type: video/mp4`. Gövde bellekte tutulmadan akıtılır (stream). **Her yanıt en çok 4 MiB'lık dilimdir** (istek `bytes=0-` gibi açık uçlu olsa bile `206` ile kısaltılır; tarayıcı devamını ister). Böylece Vercel gövde sınırının altında kalınır, iptal edilen akışlar kotayı boşa harcamaz. Geçersiz/çoklu aralık `416`. *(Planlama sırasında eklenen karar.)*
4. **Başlıklar:** `Cache-Control: private, no-store`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`. Adres, başka sitelerde gömülemez.
5. **Tarayıcı bağlamı kontrolü (ek savunma):** `Sec-Fetch-Dest: document` (adres çubuğuna yapıştırma/yeni sekme) ve `Sec-Fetch-Site` `cross-site` ise reddedilir. Bu kontrol tek başına yeterli sayılmaz (tarayıcı dışı araçlar başlığı taklit edebilir); asıl koruma 1–2'deki oturum ve yetkidir.
6. **Kullanım kotası ve log:** Kullanıcı başına ders başına 24 saatte en çok video boyutunun ~5 katı bayt akıtılır (*benim kararım, ayarlanabilir sabit*), aşılırsa `429`. Aşırı kullanım loglanır (hesap paylaşımı/otomatik indirme tespiti için). Sayaç için küçük bir tablo (`video_stream_usage`: user_id, lesson_id, gün, bayt) veya eşdeğeri; yeni migration `002_*.sql`.
7. Oturum çerezi `SameSite=Lax`, `HttpOnly` olduğundan başka sitenin sayfası bu adresi kullanıcı adına çağıramaz; bağlantıyı kopyalayan kişi kendi tarayıcısında giriş yapmamışsa `401` (giriş yapmışsa kendi yetkisi neyse o).

`LessonPlayer` (video):

- `<video src="/api/client/lessons/{id}/video" controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsInline preload="metadata">`. Sağ tık menüsü kapalı. (Bunlar sadece caydırıcıdır, güvenlik katmanı değildir.)
- **Kullanıcıya özel filigran:** oynatıcının üzerinde, yarı saydam, yavaşça konum değiştiren "ad soyad · e-posta" yazısı. Ekran kaydı sızıntısında kaynağı gösterir. Tam ekranda da görünmesi için `<video>` ve filigran aynı kapsayıcıda tam ekrana alınır (`requestFullscreen` kapsayıcıda) — *benim kararım, varsayılan açık*.
- Tamamlanma: `ended` olayı veya `timeupdate` ile süre oranı ≥ %95 → mevcut `markComplete()`. `canTrack=false` (admin önizleme) aynen kalır.
- Hata (`401` → "oturumun sona erdi, yeniden giriş yap", `403` → "bu kursa erişimin yok", `429` → "çok fazla istek").
- YouTube IFrame API kodu, Vimeo iframe'i ve "Dersi tamamladım" elle düğmesi (yalnızca Vimeo içindi) kaldırılır.
- `content` bir R2 anahtarı değilse (eski ders) oynatıcı yerine bilgilendirme kutusu.
- Metin dersleri aynen kalır.

**Kabul edilen sınırlar (kullanıcıya açıkça söylenir):** (a) yetkili öğrenci kendi oturumuyla videoyu araçlarla indirebilir veya ekran kaydı alabilir; filigran ve kota bunu caydırır/izlenebilir kılar, engellemez. (b) Video trafiği uygulama sunucusundan geçtiği için **bant genişliği/fonksiyon maliyeti** (~250 MB × izlenme) uygulamanın barındırıldığı yere yazılır. Vercel'de bu ücretli veri aktarımı ve fonksiyon süresi demektir; çok kullanıcılı büyümede asıl yük budur. Bu durumda ileride aynı güvenlik modelini koruyan alternatif: R2'nin önünde, aynı ana alan adı altında bir Cloudflare Worker (oturum çerezini parent-domain çerezi yaparak doğrulamak gerekir) ya da Cloudflare Stream.

### 6. Yapılandırma

- Yeni bağımlılık: `@aws-sdk/client-s3` ve `@aws-sdk/s3-request-presigner` (ya da eşdeğer SigV4 imzalama; seçim builder'a ait). Imzalı PUT için yalnızca yükleme URL'i imzalanır; GET artık sunucu içinde kimlik bilgisiyle doğrudan yapılır. R2'de AWS SDK'nın varsayılan checksum başlıklarının imzalı PUT'u bozmaması için `requestChecksumCalculation: "WHEN_REQUIRED"` gibi ayar gerekebilir.
- Endpoint `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `auto`. `CLOUDFLARE_S3_API` bucket yolu içerebilir; yalnızca origin kullanılmalı.
- **Bucket CORS** yalnızca yönetici yüklemesi (tarayıcıdan doğrudan PUT) için gerekir: izinli origin'ler yalnızca `APP_URL` (+ geliştirmede `http://localhost:3000`), metot `PUT`, başlık `Content-Type`, `ETag` expose. GET için CORS gerekmez (video aynı origin'den gelir). Anahtarın CORS yazma yetkisi varsa script ile uygulanır; yoksa Cloudflare panelinde yapılır (README'ye adımlar yazılır).
- **Kapalı bucket kontrol listesi (README):** "Public Development URL (r2.dev)" kapalı, bağlı herkese açık özel alan adı yok, R2 API token'ı yalnızca bu bucket ve gereken yetkiyle sınırlı (Object Read & Write). Anahtarlar yalnızca sunucu ortam değişkenlerinde (`NEXT_PUBLIC_` önekli değil).

### 7. Test / dokümantasyon

- `scripts/test-api.mjs` YouTube varsayımını kaldırır; yeni akışı (admin için imzalı PUT alma ve küçük dosya yükleme; video adresi: çerezsiz `401`, kayıtsız/başka kursun öğrencisi `403`, kayıtlı `200`/`206` Range ile, R2 adresinin yanıtlarda ve HTML'de hiçbir yerde görünmemesi, kota aşımı `429`) kapsar.
- `README.md` "YouTube videosu bitince" satırı ve R2/CORS kurulumu güncellenir; `.env.example`'a R2 değişkenleri eklenir.

## Builder'a bırakılanlar

Kütüphane seçimi (AWS SDK vs elle SigV4), dosya/bileşen bölünmesi, hata mesajlarının Türkçe metinleri, ilerleme çubuğunun görsel stili (mevcut `ds.css` ile uyumlu), slug fonksiyonunun yeri, imzalı URL sürelerinin ince ayarı, silme işlemlerinin transaction detayı.

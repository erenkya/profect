# Profect

Online kurs, sınav ve sertifika platformu. Next.js (App Router) + MariaDB. Arayüz Claude Design'daki
"Industry" tasarım sisteminden; arka uç, Xellence **X-Plore** LMS altyapısından uyarlandı.

## Çalıştırma

```bash
cp .env.example .env        # değerleri doldur
npm install
npm run db:migrate          # şemayı kurar (db/migrations/*.sql)
npm run db:seed             # örnek kataloğu yükler (isteğe bağlı)
ADMIN_EMAIL=ad@alan.com ADMIN_PASSWORD='…' ADMIN_NAME='Ad Soyad' npm run db:create-admin
npm run dev
```

`npm run test:api` (sunucu açıkken, `ADMIN_EMAIL`/`ADMIN_PASSWORD` ile) arka ucu uçtan uca sınar; kendi verisini siler.

## Yapı

| Alan | Yer |
|---|---|
| Şema | `db/migrations/001_init.sql` — `users, courses, modules, lessons, quizzes, questions, options, enrollments, lesson_progress, quiz_attempts, certificates, orders` |
| Oturum | `src/lib/auth.ts` — JWT, HttpOnly çerez; korumalı her istekte hesap durumu/rol DB'den doğrulanır |
| Sayfa koruması | `src/proxy.ts` (ilk hat) + sayfalarda `requireAdminPage` / `getCurrentUser` |
| Veri erişimi | `src/lib/lms.ts` (ham SQL, mysql2) |
| API | `src/app/api/{auth,admin,client,public,checkout}` |
| Admin paneli | `/admin` (kurslar, kullanıcılar, kayıtlar, siparişler) |
| Öğrenme | `/hesabim`, `/ogrenim/[slug]`, `/sertifika/[kod]` (herkese açık doğrulama) |

## Kurallar (x-plore'dan)

- Geçme notu varsayılan **%70**, sınırsız deneme; soru ve şık sırası her oturumda karıştırılır, doğru cevap istemciye gönderilmez.
- Sertifika yalnızca **final sınavı** geçilince, kurs başına bir kez verilir; `/sertifika/[kod]` herkese açıktır.
- İlerleme: Video bitince/%95'te, metin dersi sonuna kaydırılınca otomatik tamamlanır.
- Erişim: `enrollments` satırı **veya** aktif Profect Plus (`users.plus_until`). Yönetici atayabilir; kullanıcı satın alabilir.

## Ders videoları (Cloudflare R2)

Video dersler yönetici panelinden **doğrudan R2'ye** yüklenir (tarayıcı → R2, sunucudan geçmez) ve kursa kayıtlı oturumlu kullanıcılara (ücretsiz önizleme dersleri girişsiz ziyaretçilere de), sitenin kendi adresi (`/api/client/lessons/[id]/video`) üzerinden akıtılır. Tarayıcıya hiçbir R2 adresi verilmez.

**Kurulum**
1. `.env`: `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (Vercel'de de tanımlı olmalı; `NEXT_PUBLIC_` öneki **kullanma**).
2. `npm run db:migrate` — kota tabloları (`video_stream_usage`, `video_preview_usage`) için.
3. `npm run r2:setup` — yazma yetkisini doğrular ve yönetici yüklemesi için CORS kuralını (yalnızca `PUT`, `APP_URL` + `http://localhost:3000`) uygular. Token'ın CORS yetkisi yoksa betik, Cloudflare panelinde yapıştırılacak JSON'u basar.

**Kapalı bucket kontrol listesi** (Cloudflare paneli)
- *Public Development URL (r2.dev)* **kapalı**, bucket'a bağlı herkese açık özel alan adı **yok**.
- R2 API token'ı yalnızca bu bucket'a ve *Object Read & Write* yetkisine sahip.
- Önerilen: bucket'ta tamamlanmamış çok parçalı yüklemeleri otomatik silen bir *Object lifecycle* kuralı. Yönetici bir videoyu yükleyip dersi kaydetmeden çıkarsa dosya R2'de kalır; periyodik olarak `kurslar/` altındaki, DB'de karşılığı olmayan nesneler elle temizlenebilir.

**Klasör düzeni:** `kurslar/{kurs-slug}/{modül-id}-{modül-adı}/{rastgele}-{ders-adı}.mp4`. Yol DB'de saklanır; kurs/modül yeniden adlandırılırsa dosya taşınmaz.

**Güvenlik modeli ve sınırlar**
- Her video isteğinde oturum, hesap durumu ve kurs erişimi doğrulanır; yanıt en çok 4 MiB'lık `Range` dilimidir. Bağlantıyı kopyalayan, giriş yapmadıkça izleyemez.
- Kullanıcı × ders × gün başına video boyutunun 5 katı bayt sınırı vardır (aşılınca `429`). Ekranda kullanıcıya özel filigran gösterilir.
- Giriş yapmış bir öğrencinin ekran kaydı almasını veya kendi oturumuyla dosyayı indirmesini **engelleyemez**, caydırır ve izlenebilir kılar.
- Video trafiği Vercel fonksiyonundan geçer; her izlenme (~video boyutu kadar) veri aktarımı ve fonksiyon süresi olarak faturalanır.

## Ödeme

Online ödeme sağlayıcısı henüz bağlı değil. `PAYMENT_MODE=manual` iken sipariş `pending` olur ve
`/admin/siparisler` üzerinden onaylanınca erişim açılır. Kart bilgisi hiçbir yerde saklanmaz.
`PAYMENT_MODE=mock` yalnızca geliştirme içindir (sipariş anında ödenmiş sayılır) — canlıda **kullanmayın**.

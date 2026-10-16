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
- İlerleme: YouTube videosu bitince/%95'te, metin dersi sonuna kaydırılınca otomatik tamamlanır.
- Erişim: `enrollments` satırı **veya** aktif Profect Plus (`users.plus_until`). Yönetici atayabilir; kullanıcı satın alabilir.

## Ödeme

Online ödeme sağlayıcısı henüz bağlı değil. `PAYMENT_MODE=manual` iken sipariş `pending` olur ve
`/admin/siparisler` üzerinden onaylanınca erişim açılır. Kart bilgisi hiçbir yerde saklanmaz.
`PAYMENT_MODE=mock` yalnızca geliştirme içindir (sipariş anında ödenmiş sayılır) — canlıda **kullanmayın**.

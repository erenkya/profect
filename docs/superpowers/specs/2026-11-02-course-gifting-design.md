# Kurs Hediye Etme — Tasarım

Tarih: 2026-11-02 · Durum: onay bekliyor

## Amaç ve neden

Giriş yapmış bir kullanıcı, henüz kayıtlı olmayan (ya da kayıtlı) birinin mail adresini vererek ona **tek bir kurs** hediye edebilmeli. Hediye eden de alıcı da mail alır. Alıcı maili teslim alamazsa hediye eden, hediyeyi başka bir yoldan (WhatsApp vb.) iletebilmesi için linke erişebilir.

Linkin güvenliği birinci önceliktir: URL'yi değiştirerek ya da bir linki ele geçirerek kimse başkasına ait bir hediyeyi alamaz.

## Hedefler

- Tek kurs hediyesi: ödeme → bekleyen hediye → mail → alma → kurs erişimi.
- Hesabı olmayan alıcı, linke tıklayınca **mail adresi dolu ve kilitli kayıt ekranına** yönlenir. Hesabı olan alıcı giriş ekranına yönlenir.
- Hediye **yalnızca doğrulanmış (`email_verified=1`) ve hediyedeki adresle birebir eşleşen** bir hesap tarafından alınabilir. Karar: kullanıcı onayladı ("sadece o mail adresiyle alınabilsin").
- Hediye eden, hediyelerini bir sayfadan görür; linki yeniden üretip kopyalayabilir ve maili yeniden gönderebilir.
- Mevcut ödeme sağlayıcılarının (manual, mock, tami, 100% kupon) hepsiyle çalışır.

## Hedef olmayanlar (v1)

- Sepetle çoklu kurs ya da Plus üyeliği hediyesi (kullanıcı tek kurs dedi).
- Link olmadan, sadece o mail adresiyle kayıt olunca otomatik hediye alma (benim kararım: alma işlemi bilinçli yapılır, link şart).
- Hediyede otomatik iade. Süresi dolan hediyeyi admin manuel yönetir.
- Admin panelinde hediye yönetim ekranı (builder'ın takdiri: admin sipariş listesinde hediye siparişini işaretlemek yeterli).
- Hediye alınınca göndericiye "alındı" maili (benim kararım: yok).

## Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- Linke sahip olan herkesin hediyeyi kendi hesabına alabilmesi.
- Alıcı mailinin bir hesabın var olup olmadığını dışarı sızdırması (ör. ödeme ekranında "bu kullanıcı zaten kayıtlı" demek).
- Token'ın veritabanında düz metin saklanması.
- Hediye siparişinin ödemesiyle kursun **gönderene** yazılması.

## Kısıtlar ve mevcut yapı

Next.js 16 (AGENTS.md: `node_modules/next/dist/docs/` okunmadan kod yazılmaz), MySQL/`mysql2` düz SQL, ORM yok. Migration'lar `db/migrations/NNN_*.sql` (son commit'li: 014; çalışma ağacında başka bir işe ait commit'siz `015_lesson_comments.sql` var, bu yüzden hediye migration'ı **016** olur — uygularken `ls db/migrations` ile sıradaki boş numarayı doğrula). Tüm metinler Türkçe, i18n kütüphanesi yok. Ayrıntılı kod haritası:

- Ödeme: tüm sağlayıcılar sonunda `fulfillOrder` (`src/lib/lms.ts:330`) çağırır. **Hediye mantığı burada dallanırsa tüm sağlayıcıları tek yerde kapsar.** Bugün kurs `o.user_id`'ye (alıcıya değil, siparişi verene) yazılıyor.
- Siparişler: `orders`, `order_items` (`src/lib/orders.ts`, `createCartOrder`); checkout şeması `src/lib/checkout-schema.ts`; faturalama alanları ve dört yasal onay zorunlu.
- Token deseni: `src/lib/tokens.ts` (`randomBytes(32)` hex + SHA-256 hash, `CHAR(64)`).
- Mail: `src/lib/mail.ts` (nodemailer/Gmail SMTP; `layout()` düğmeli şablon; `deliver()`; gönderimler `after()` içinde).
- Gönderim limiti deseni: `src/lib/verification.ts` — tek koşullu `UPDATE` ile cooldown + saatlik sınır, DB saatiyle.
- Kayıt: `/kayit`, `RegisterForm`, `POST /api/auth/register`; doğrulama `POST /api/auth/verify-email` (doğrulayınca oturum açar); `safeNext` yalnızca site içi path'lere izin verir. Kayıt formu bugün mail ön dolumunu desteklemiyor.
- Genel bir rate limiter **yok**; DB tabanlı, satır başına sınırlar kullanılıyor.
- UI: `CourseCardActions.tsx`, `PurchasePanel.tsx`; stil `ds.css`/`globals.css` sınıfları ve inline style, bileşen kütüphanesi yok.

## Tasarım

### Veri (migration 016)

Yeni `gifts` tablosu:

| Alan | Not |
|---|---|
| `id`, `order_id` (UNIQUE, FK) | hediye ↔ ödeme siparişi |
| `sender_id`, `course_id` | |
| `recipient_email` | küçük harfe çevrilmiş, trim; **birebir** eşleşme (gmail noktası/+ kanonikleştirme yok) |
| `message` | isteğe bağlı kısa not (en fazla 300 karakter, mailde `esc()` ile) |
| `status` | `awaiting_payment` → `pending` → `claimed` ; yan dallar: `expired`, `cancelled` |
| `token_hash` (`CHAR(64)`, UNIQUE, NULL olabilir) | token yalnızca ödeme onayından sonra üretilir; düz metin saklanmaz |
| `expires_at` | aktivasyondan 30 gün sonra (benim kararım) |
| `claimed_by_user_id`, `claimed_at` | |
| `sent_at`, `send_count`, `send_window_start` | tekrar gönderim limiti (verification.ts deseni) |
| `created_at` | |

`enrollments.source` ENUM'una `'gift'` eklenir. `orders` tablosuna dokunulmaz: hediye siparişi, `gifts.order_id` ile eşleşen normal bir tek-kalemli sipariştir (`order_items`'ta bir `course` satırı).

### Hediye satın alma

1. Kurs detay sayfasında (`PurchasePanel`) ve kurs kartında "Hediye Et" düğmesi. Düğme, kursa zaten sahip olan kullanıcıda da görünür (kendine sahip olduğu kursu başkasına hediye edebilir).
2. Giriş yapılmamışsa `/giris?next=/hediye-et/<slug>`.
3. Yeni sayfa `/hediye-et/<slug>`: alıcı mail adresi (iki kez girilmez, ama biçim doğrulanır), isteğe bağlı not, mevcut checkout'taki faturalama + yasal onay bileşenleri.
4. Yeni `POST /api/gifts/checkout`: `requireUser`, zod doğrulaması, alıcı mail ≠ gönderenin kendi maili, kurs yayınlı; fiyat sunucuda DB'den hesaplanır (istemci fiyatına güvenilmez). Sipariş + `gifts` satırı (`awaiting_payment`) tek transaction'da oluşur, sonra mevcut `payment` sağlayıcısına gidilir.
5. Kupon: mevcut `validateCoupon` yeniden kullanılır (builder'ın takdiri; kapsam dışı bırakmak da kabul).

Ödemede gönderenin veya alıcının "zaten sahip" olup olmadığı **kontrol edilmez** (hesap varlığı sızmasın diye).

### Aktivasyon (`fulfillOrder` dalı)

`fulfillOrder` içinde sipariş bir hediyeye bağlıysa (`gifts.order_id`):

- `enrollments`'a **hiçbir şey yazılmaz** (kurs gönderene gitmez).
- Aynı transaction'da: 32 bayt rastgele token üretilir, yalnızca SHA-256 hash'i saklanır; `status='pending'`, `expires_at=NOW()+30 gün`, `sent_at` ayarlanır.
- Commit sonrası `after()` içinde iki mail gider: **alıcıya** hediye maili (gönderenin adı, kurs, not, düğme = alma linki), **gönderene** onay maili (aynı linki "mail gitmezse bu linki iletebilirsiniz" notuyla içerir). Gönderene mevcut makbuz maili de gider.
- Mail hatası siparişi bozmaz (mevcut desen). İdempotensi mevcut `status === 'paid'` erken çıkışıyla korunur: token ve mail yalnızca ilk geçişte üretilir.

### Alma akışı

Link: `/hediye/<token>` (token = 64 hex).

1. Sunucu bileşeni token'ı hash'leyip `gifts` satırını bulur. Bulunamaz / `expired` / `claimed` / `cancelled` ise **tek tip, bilgi sızdırmayan** mesaj ("Bu hediye linki geçersiz veya süresi dolmuş").
2. Sayfa `Referrer-Policy: no-referrer`, `noindex`, `Cache-Control: no-store` ile servis edilir (token sızmasın).
3. Oturum yoksa: alıcı maili ile kayıtlı **doğrulanmış** bir kullanıcı varsa `/giris?next=/hediye/<token>`, yoksa `/kayit?hediye=<token>`.
4. `/kayit?hediye=<token>`: sunucu token'ı çözüp geçerliyse `RegisterForm`'a `lockedEmail` verir (alan salt okunur). `POST /api/auth/register` `giftToken` alırsa token'ı yeniden doğrular ve gövdedeki maili **yok sayıp** `gifts.recipient_email`'i kullanır. Normal kayıt sonrası `next=/hediye/<token>` ile mevcut `/e-posta-dogrula` akışına gidilir; doğrulama oturumu açar ve kullanıcı hediye sayfasına döner.
5. Oturum açıkken `/hediye/<token>`: oturumdaki kullanıcının maili doğrulanmış ve `recipient_email` ile **birebir** eşleşiyorsa "Hediyeyi Al" düğmesi gösterilir. Eşleşmiyorsa "Bu hediye başka bir hesaba ait. Doğru hesapla giriş yapın" ve çıkış düğmesi (mail adresi tam gösterilmez, maskelenir: `a***@gmail.com`).
6. "Hediyeyi Al" = `POST /api/gifts/claim` (GET asla durum değiştirmez). Tek transaction: `SELECT ... FOR UPDATE`, `status='pending'`, `expires_at > NOW()`, kullanıcının maili doğrulanmış ve eşleşiyor → `INSERT IGNORE enrollments (..., 'active', 'gift')`, `status='claimed'`, `claimed_by_user_id`, `claimed_at`. Başarıda kullanıcı `/ogrenim/...` derse yönlenir.
7. Kullanıcı kursa zaten sahipse: hediye `pending` kalır, kullanıcıya açık mesaj verilir; iade admin tarafından manuel yönetilir (benim kararım).

URL'de mail ya da id taşınmaz; erişim tek başına token + doğrulanmış mail eşleşmesiyle verilir. Kayıt öncesi sahte mail doğrulaması mümkün değildir (6 haneli kod mevcut sistemle alınır).

### Gönderen paneli

`/hesabim/hediyeler`: gönderilen hediyeler (kurs, alıcı mail, durum, bitiş tarihi). `pending` hediyede iki eylem:

- **Mail'i yeniden gönder** ve **Linki yenile ve kopyala**: ikisi de token'ı **döndürür** (yeni token, eski hash'in yerine yazılır; eski link geçersiz olur). Düz token saklanmadığı için "mevcut linki göster" mümkün değildir; arayüz bunu açıkça belirtir ("Önceki link geçersiz olur"). Yeniden gönderimde alıcıya yeni linkli mail gider. Karar bende: döndürme, geri döndürülebilir şifreli saklamaya tercih edildi.
- Yeniden gönderim sınırı: gift başına 60 sn cooldown + saatte 5 (verification.ts'teki koşullu-`UPDATE` deseni, DB saatiyle). Yalnızca `status='pending'` ve gönderene ait hediyelerde; sahiplik her istekte sunucuda doğrulanır (başkasının hediye id'siyle işlem yapılamaz).

### Güvenlik özeti

- Token: 256 bit, `crypto.randomBytes`, DB'de yalnızca SHA-256, aramalar hash üzerinden (zamanlama saldırısı yüzeyi yok).
- Tek kullanımlık, süreli, durum kontrolü transaction + `FOR UPDATE` ile (çift alma yarışı yok).
- Sahiplik kanıtı: doğrulanmış mail eşleşmesi; link tek başına yetmez.
- IDOR: hediye listesi ve eylemleri `sender_id = oturum kullanıcısı` ile filtrelenir.
- Mail bombalama: hediye ödeme gerektirir; ek olarak gönderen başına saatlik hediye oluşturma sınırı (öneri: 10) ve gift başına yeniden gönderim sınırı. Kupon yüzünden bedava hediye mümkünse bu sınır geçerlidir.
- Mail içeriği `esc()` ile kaçışlanır (özellikle gönderen adı ve not).
- Hata mesajları hesap varlığını sızdırmaz.

## Test

`npm test` (`node --test src/lib/*.test.ts`) deseniyle saf mantık testleri: token üretimi/hash, mail normalizasyonu, "alınabilir mi" karar fonksiyonu (durum, süre, doğrulanmış mail, eşleşme, zaten sahip), yeniden gönderim sınırı hesabı. DB'li akışlar için elle doğrulama listesi (mock sağlayıcıyla uçtan uca: hediye et → mail (MAIL_DRY_RUN) → kayıt → doğrulama → alma; yanlış hesapla alma denemesi; süresi dolmuş; çift alma).

## Durum geçişleri (benim kararlarım)

- `awaiting_payment` → `cancelled`: admin manuel siparişi reddettiğinde mevcut reddetme yolunda (`orders.status='rejected'`) aynı transaction'da yapılır. Ödenmemiş hediye hiçbir zaman token almaz.
- `pending` → `expired`: ayrı bir zamanlayıcı yok; `expires_at` her okumada kontrol edilir ve süresi geçmiş satır o anda `expired` olarak işaretlenir (okuma/alma/liste).
- Linki yenilemek (token döndürmek) `expires_at` değerini **uzatmaz**.

## Builder'a bırakılanlar

- Dosya/route adlandırması, bileşen ayrımı, yeniden kullanım için `CheckoutForm` parçalarını nasıl bölüneceği.
- Kuponun v1'e dahil edilip edilmemesi.
- Admin sipariş listesinde hediye işareti.
- Hediye mail ve sayfa metinlerinin Türkçe kopyası (mevcut mail tonuyla).

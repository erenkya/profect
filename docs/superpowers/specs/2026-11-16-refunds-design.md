# İade Süreci: Tasarım

Tarih: 2026-11-16 · Durum: onay bekliyor

Önceki belgeler: `2026-11-02-course-gifting-design.md` (hediye), `2026-11-03-company-accounts-design.md` ve `2026-11-05-company-program-seats-design.md` (şirket kontenjanı). İade, bu üçünün sipariş yapısına dokunur. Dil Türkçedir; arayüz metinleri ve kod yorumları mevcut koddaki gibi Türkçe kalır. "Karar" etiketli maddeler ürün sahibinin söyledikleridir; "Benim kararım" etiketliler tasarımcının doldurduğu boşluklardır.

## 1. Amaç ve neden

Sitedeki yasal metinler bir iade politikası vaat ediyor: ödemeden sonra 14 gün içinde ve kursa başlanmamışsa iade, karta en geç 10 iş günü içinde. Ama kodda bu politikayı işleten hiçbir şey yok: sipariş durumları yalnızca `pending | paid | rejected`, `src/lib/payment/tami.ts` içinde iade/iptal çağrısı yok, admin panelinde iade butonu yok. Bugün bir iade, birinin e-postayı okuyup veritabanında elle erişim silmesi demek.

Sanal POS (Tami) devreye girdiğinde iade sürecinin neredeyse hazır olması gerekiyor. Kartlı ödeme şu an kapalı (`CARD_PAYMENT_ENABLED = false`); siparişler elle onaylanıyor ve ödeme havaleyle alınıyor. Dolayısıyla iade süreci **ödeme sağlayıcısından bağımsız** kurulmalı: bugün elle, POS açılınca yalnızca tek bir sağlayıcı fonksiyonu doldurularak çalışmalı.

Başarı ölçütü: kullanıcı uygun bir siparişi hesabından iade için başvurabiliyor; admin uygunluğu hazır görüp tek tıkla onaylıyor; erişim, hediye ve kontenjan etkileri tutarlı şekilde geri alınıyor; POS geldiğinde yalnızca Tami iade çağrısı yazılıyor.

## 2. Kararlar (ürün sahibinden)

- **Akış: kullanıcı talep eder, admin onaylar.** Uygunluk (14 gün, başlanmamış) otomatik hesaplanıp hem kullanıcıya hem admine gösterilir. Tam otomatik iade ve yalnızca-admin akışı seçilmedi.
- **Veri modeli: ayrı `refund_requests` tablosu + sipariş durumuna `refunded`.** Ödeme tarafında bir `refund` arayüzü olur; elle uygulaması şimdi çalışır, Tami uygulaması POS gelince doldurulur.
- **Yalnızca tam sipariş iadesi.** Kısmi / kalem bazlı iade yoktur.
- **Hediye:** alıcı henüz almadıysa iade edilir ve hediye iptal olur; alındıysa iade başvurusu uygun değildir.
- **Şirket kontenjanı:** atanmamış kontenjan iade edilir; atama varsa uygun değildir (admin yönetir).
- **Kupon:** iade tutarı, indirimden sonra gerçekten ödenen tutardır.
- **Elle ödeme:** admin banka iadesini kendisi yapar ve panelde "iade yapıldı" der.

## 3. Hedefler, hedef olmayanlar, istenmeyen sonuçlar

**Hedefler**
- Sipariş sahibi, uygun bir ödenmiş siparişi için hesabından iade başvurusu yapabilir.
- Admin, iade kuyruğunda uygunluk gerekçesiyle birlikte başvuruyu onaylar/reddeder; elle ödemede "iade yapıldı" der.
- Onaylanan iadede erişim (kurs, program, hediye, kontenjan) tek işlemde geri alınır.
- Sağlayıcı arayüzü: `manual` çalışır, `tami` POS gelince yalnızca iç fonksiyonu doldurulur.
- Her başvuru geçmişi (gerekçe, uygunluk özeti, karar, kim/ne zaman) kayıtlı kalır.

**Hedef olmayanlar (bu sürümde)**
- Kısmi / kalem bazlı iade.
- Şirket admini adına çalışan atanmış kontenjanın iadesi (admin elle yönetir).
- İade faturası / e-arşiv iptali (muhasebe süreci, kodda değil).
- Kullanıcının reddedilen başvuruyu yeniden başvurması (destek yazışmasıyla ilerler).
- Hizmet kesintisi iadesi (yasal metin 5. madde, elle değerlendirilir).

**İstenmeyen sonuçlar (teknik olarak çalışsa bile başarısızlık sayılır)**
- Aynı sipariş için iki kez para iadesi (çift tık, eş zamanlı iki admin, sağlayıcı çağrısı başarılı ama kayıt güncellemesi düşerse yeniden deneme).
- İade edilip erişimi açık kalan kullanıcı; ya da erişimi kapanıp parası iade edilmemiş kullanıcı.
- Kullanıcının başka yoldan sahip olduğu (hediye, admin, başka ödenmiş sipariş) kurs erişiminin iade yüzünden silinmesi.
- Başkasının siparişi için iade başvurusu yapılabilmesi ya da başvuru durumunun görülebilmesi.
- İade sonrası gelir raporlarında siparişin hâlâ "ödendi" sayılması.

## 4. Kısıtlar

- Next.js 16 / App Router; `AGENTS.md` uyarınca uygulamadan önce `node_modules/next/dist/docs/` ilgili kılavuzları okunur.
- MySQL (mysql2); migration dosyaları `db/migrations/NNN_*.sql`, yeniden çalıştırılabilir ve yalnızca ekleyici olmalı (mevcut satırlara dokunmaz). Sonraki numara `027`.
- Saf kural fonksiyonları `server-only` içermez, `src/lib/*-rules.ts` + `node --test` ile test edilir (`npm test`). Mevcut örnekler: `gift-rules.ts`, `company-rules.ts`, `program-seat-rules.ts`.
- Kart verisi hiçbir yerde saklanmaz (mevcut kural). İade için `bank_auth_code`/`provider_ref` yeterlidir.
- Tami'nin iade/iptal API'sinin ayrıntıları bu belgede bilinmiyor; sağlayıcı arayüzü bundan bağımsız tasarlanır (bkz. 6.4).

## 5. Yaklaşımlar

1. **Ayrı `refund_requests` tablosu + `orders.status = 'refunded'` (seçilen).** Talep, gerekçe, uygunluk özeti ve durum geçmişi ayrı tabloda; sipariş yalnızca işlem bittiğinde `refunded` olur. Başarısız Tami denemesi `failed` olarak kalır ve yeniden denenebilir. Maliyeti: yeni tablo, yeni admin ekranı ve sipariş durumu eklemek (sipariş durumunu okuyan yerler gözden geçirilir).
2. **Yalnızca `orders` tablosuna iade sütunları.** Daha az iş, ama kullanıcının gerekçesi, reddedilen/başarısız denemeler ve kim onayladı bilgisi için yer yok. Tami hatasında yazacak yer belirsiz kalır. Seçilmedi.
3. **Kalem bazlı iade satırları.** Sepet siparişlerinde esnek, ama kısmi iade istenmediği için kupon dağıtımı, program ve kontenjan hesabını gereksiz karmaşıklaştırır. Seçilmedi.

## 6. Tasarım

### 6.1 Veri modeli (migration `027_refunds.sql`)

- `orders.status` ENUM'a `refunded` eklenir. `orders.refunded_at DATETIME NULL` eklenir.
- Yeni tablo `refund_requests`:
  - `id`, `order_id` (**UNIQUE**: sipariş başına tek başvuru; benim kararım: reddedilen başvuru yeniden açılamaz, destek yazışmasıyla admin `override` ile ilerler), `user_id` (başvuran = sipariş sahibi), `amount` (iade edilecek tutar, `orders.amount`'tan başvuru anında kopyalanır), `currency`.
  - `status` ENUM(`requested`,`approved`,`refunded`,`rejected`,`failed`):
    - `requested` → admin kararı bekliyor
    - `approved` → admin onayladı; elle ödemede banka iadesi bekleniyor, otomatik sağlayıcıda işlem anlıktır
    - `refunded` → para iade edildi, erişim geri alındı, sipariş `refunded` oldu
    - `rejected` → admin reddetti (`decision_note` zorunlu)
    - `failed` → sağlayıcı çağrısı hata verdi; admin yeniden dener
  - `reason` (kullanıcının serbest gerekçesi, opsiyonel, ≤500), `eligibility_json` (başvuru anındaki uygunluk özeti), `override` TINYINT (admin uygunluk dışı onay verdi mi), `decision_note`, `decided_by`, `decided_at`, `provider`, `provider_ref` (sağlayıcının iade referansı), `error_message`, `refunded_at`, `created_at`.
  - FK: `order_id → orders ON DELETE CASCADE`, `user_id → users ON DELETE CASCADE`, `decided_by → users ON DELETE SET NULL`.

### 6.2 Uygunluk kuralları (`src/lib/refund-rules.ts`, saf ve testli)

Girdi: sipariş özeti, kalemler, "başladı mı" bilgisi, hediye/kontenjan durumu, şimdiki zaman. Çıktı: `{ eligible: true } | { eligible: false; reasons: RefundBlockReason[] }`. Sabitler: `REFUND_WINDOW_DAYS = 14`.

Engel nedenleri:
- `not_paid`: sipariş `paid` değil (zaten `refunded`, bekleyen, reddedilmiş).
- `free_order`: tutar 0.
- `window_expired`: `paid_at` üzerinden 14 günden fazla geçmiş.
- `already_started`: kurs/program başlanmış (aşağıda).
- `gift_claimed`: hediye alıcı tarafından alınmış.
- `seats_assigned`: şirket kontenjan siparişinde kontenjan atanmış/yanmış, toplam düşünce atanan+yanan sayının altına inecek.
- `request_exists`: bu sipariş için zaten başvuru var.

**"Başladı mı" (benim kararım).** Mevcut `hasWatched` (`src/lib/company-watch.ts`) kuralı kullanılır: en az bir tamamlanmış ders ya da `WATCH_MIN_BYTES` (512 KB) üstü video akışı. Gerekçe: kontenjan geri almadaki "yanma" kuralıyla aynı tanım olsun; kısa/yanlışlıkla açılan istekler iadeyi engellemesin. Yasal metin "herhangi bir dersi açmak veya izlemek" diyor, eşik bunun biraz gevşeğidir. **Önemli fark:** iade kontrolü yalnızca **satın alma tarihinden sonraki** ilerleme ve akışa bakar (`lesson_progress.completed_at >= paid_at`, `video_stream_usage.day >= DATE(paid_at)`). Satın almadan önce ücretsiz önizlemede izlenen ders iadeyi engellemez. Bunun için `hasWatched`'ın `since` parametreli bir kardeşi (`hasStartedSince`) yazılır. Siparişteki kalemler: `course` → o kurs; `program` → programdaki tüm kurslar; herhangi birinde başlanmışsa `already_started`. `seats`/`program_seats` kalemlerinde "başladı mı" kontrolü yoktur (erişim çalışana atanmadan açılmaz).

**Admin override.** Admin, uygunluk engellerinden yalnızca `already_started` ve `window_expired` olanlarını gerekçe yazarak aşabilir (iyi niyet iadesi, destek yazışması). `not_paid`, `free_order`, `request_exists`, `gift_claimed`, `seats_assigned` aşılamaz (sistem tutarlılığı; kontenjanı önce elle serbest bırakmak gerekir). Override başvuruya `override = 1` ve `decision_note` olarak yazılır.

### 6.3 Akış

1. **Başvuru.** Kullanıcı `/hesabim/siparislerim/[id]` sayfasında "İade talep et" bölümünü görür: uygun değilse nedenleri (Türkçe, tek satır), uygunsa gerekçe alanı + gönder. `POST /api/orders/[orderId]/refund` sipariş sahibi olduğunu doğrular, sipariş satırını `FOR UPDATE` kilitler, uygunluğu **sunucuda yeniden hesaplar** (istemci uygunluğuna güvenilmez), `refund_requests` satırı (`requested`) açar. Admine bilgilendirme maili gider (`ORDER_NOTIFY_TO`, mevcut yeni-sipariş bildirimi gibi).
2. **Admin kuyruğu.** Yeni sayfa `/admin/iadeler` (admin sekmelerine eklenir): açık başvurular önce; her satırda sipariş, kalemler, tutar, gün sayısı, uygunluk özeti, gerekçe. Eylemler: **Onayla**, **Reddet** (not zorunlu), **İade yapıldı** (yalnızca elle sağlayıcıda ve `approved` iken), **Yeniden dene** (`failed` iken). Her kritik eylem mevcut `OrdersTable` gibi 2. onay ister.
3. **Onay.** `PATCH /api/admin/refunds/[id]` (`requireAdmin`). Onayda uygunluk **yeniden hesaplanır** (başvurudan beri kullanıcı başlamış olabilir); engel varsa ve override verilmemişse reddedilir. Sonra sağlayıcıya göre:
   - **elle:** durum `approved`; admin bankadan iadeyi yapıp "İade yapıldı" der → 4.
   - **otomatik (Tami):** sağlayıcı çağrısı yapılır; başarıda → 4; hatada `failed` + `error_message`.
4. **Sonuçlandırma (tek işlem).** `refunded` durumuna geçerken aynı transaction içinde: sipariş `refunded` + `refunded_at`; erişim geri alma (6.5); hediye iptali; kontenjan düşürme; kupon kullanımı iadesi (6.5). Kullanıcıya "iadeniz onaylandı" maili gider. Redde "iadeniz reddedildi + not" maili gider.

**Eş zamanlılık ve çift iade.** Onay/sonuçlandırma sipariş satırı `FOR UPDATE` kilidi altında yapılır; durum geçişleri koşullu `UPDATE ... WHERE status = ?` ile ve `affectedRows` kontrolüyle yapılır. Sağlayıcı çağrısı kilidin dışında yapılır (uzun ağ çağrısı bağlantı tutmasın) ama `refund_requests.id` sağlayıcıya idempotency anahtarı olarak gider; çağrıdan önce satır `approved` + `provider_ref` boş, çağrıdan sonra `provider_ref` yazılır. Çağrı başarılı ama sonuçlandırma düşerse yeniden deneme önce `provider_ref` var mı bakar ve çağrıyı **tekrarlamadan** yalnızca sonuçlandırır.

### 6.4 Ödeme sağlayıcısı arayüzü

`src/lib/payment/refund.ts`: `refundOrder(order, requestId) → { kind: "done"; providerRef } | { kind: "manual_pending" } | { kind: "failed"; message }`. Sağlayıcı `orders.provider` ile (`manual | mock | tami`) seçilir:
- `manual` → `manual_pending` döner (banka iadesini admin yapar).
- `mock` → `done` döner (geliştirme/demo).
- `tami` → şimdilik "yapılandırılmadı" hatası döner; POS gelince burası doldurulur. İşlem günü içindeyse iptal (void), değilse iade çağrısı olması beklenir; hangisinin kullanılacağı Tami dokümanına göre belirlenir (ayrıntılar işi yapana bırakılır, bkz. 8). `tami.ts`'teki `call` ve imza yardımcıları yeniden kullanılır.

### 6.5 İadenin etkileri (sonuçlandırma anında)

- **Kurs kalemi:** `enrollments` satırı yalnızca `source = 'purchase'` ise silinir; ve yalnızca başka **ödenmiş, iade edilmemiş** bir sipariş (ya da programı) aynı kursu hâlâ karşılamıyorsa. Başka kaynaklı kayıtlara (hediye, admin, şirket) dokunulmaz.
- **Program kalemi:** `program_enrollments` (kaynak `purchase`) silinir; programdaki kurslar için yukarıdaki kural uygulanır (`releaseProgramAccess` kardeş mantığı, aynı "başka yoldan karşılanıyor mu" koruması). İlerleme ve sertifikalara dokunulmaz (zaten başlanmamıştır; override ile iade edilmişse korunur).
- **Hediye siparişi:** `gifts.status = 'pending'` ise `cancelled`, `token_hash = NULL` (link ölür). `claimed` ise uygun değildir (engel). Alıcıya mail gönderilmişse "hediye iptal edildi" maili gitmez; link zaten "geçersiz" mesajı verir (mevcut tek tip mesaj).
- **Şirket kontenjan siparişi** (`seats`, `program_seats`): `company_allocations` / `company_program_allocations` içindeki sipariş satırı (`order_id`, UNIQUE) silinir; şirket kilidi (`lockCompany`) altında, toplam atanan+yanan sayının altına inmiyorsa. İnecekse uygunluk `seats_assigned` ile bloklanır (override bu engeli aşmaz; admin önce kontenjanı serbest bırakır, bkz. 8).
- **Kupon:** `coupon_redemptions` satırı (`order_id` UNIQUE) silinir, kupon sayacı yeniden kullanılabilir olur.
- **Gelir/rapor sorguları:** sipariş durumu `paid` filtreleyen yerler gözden geçirilir; `refunded` siparişler gelirden düşer, "siparişler" listesinde ayrı rozetle görünür.

### 6.6 Arayüz

**Kullanıcı yolu:** Hesabım → Siparişlerim → siparişe tıkla → sipariş detayında "İade talep et" bölümü. Bulunabilirlik için üç giriş noktası olur (benim kararım):
1. `/hesabim/siparislerim` listesinde, iade başvurusu yapılabilir her satırda "İade talep et" bağlantısı (detay sayfasındaki bölüme gider).
2. Sipariş detay sayfasında, "Fatura bilgileri" bölümünün üstünde iade bölümünün kendisi.
3. `/iade-ve-iptal` yasal sayfasında "Hesabım → Siparişlerim" bağlantılı yönlendirme cümlesi (giriş yapmamışsa `/giris?next=/hesabim/siparislerim` üzerinden).

Uygun olmayan siparişte bölüm gizlenmez, nedenini gösterir ("14 gün geçti", "kursa başlandı" vb.); böylece kullanıcı butonu aramak zorunda kalmaz.

- `/hesabim/siparislerim/[id]`: durum rozeti `refunded` ("İade edildi") ve açık başvuru varsa durum satırı ("İade talebiniz inceleniyor", "iadeniz onaylandı, bankanıza 10 iş günü içinde yansır", "reddedildi: not"). `ORDER_STATUS` sabitine `refunded` eklenir.
- `/hesabim/siparislerim`: liste rozeti.
- `/admin/iadeler`: kuyruk (6.3 madde 2). `OrdersTable`: `STATUS` haritasına `refunded` ve tip birleşimine eklenir; iadesi açık siparişte "İade talebi var" bağlantısı.
- Yasal metin (`CheckoutLegalContent.tsx` 3. ve 4. madde) "e-posta ile başvur" diyor; başvuru artık hesaptan da yapılabildiği için metne "hesabınızdaki sipariş sayfasından ya da e-posta ile" eklenir. Hukuki anlamı değişmez.

### 6.7 Testler

- `refund-rules.test.ts` (saf, `npm test`): pencere sınırı (14. gün dahil mi), her engel nedeni, birden çok neden birlikte, override ile aşılabilirler/aşılamazlar.
- `scripts/test-refunds.mjs` (mevcut `test-gifts.mjs` kalıbı, gerçek DB): başvuru → onay → sonuçlandırma uçtan uca; çift onayda tek iade; hediye alınmışken engel; hediye `pending` iken iptal; başka yoldan sahip olunan kursun korunması; satın almadan önce izlenmiş önizlemenin engel olmaması; yetkisiz kullanıcının başka siparişe başvuramaması.

## 7. İstenmeyen sonuç kontrolü

Çift iade → durum geçişleri koşullu UPDATE + `provider_ref` ile tekrar çağrı yok (6.3). Yanlış erişim silme → yalnızca `source = 'purchase'` ve "başka yoldan karşılanıyor mu" koruması (6.5). Yetki → başvuru yalnızca sipariş sahibine, karar yalnızca admine (`requireAdmin`); sipariş bulunamazsa ve başkasınınsa aynı 404. Rapor tutarlılığı → `refunded` ayrı durum, gelir sorguları gözden geçirilir.

## 8. İşi yapana bırakılanlar ve benim kararlarım

**İşi yapana bırakılan**
- Tami iade/iptal uç noktası ve istek biçimi. `tami.ts` başlığındaki not, protokolün `XellenceWeb/lib/tami-pos.ts` ile aynı olduğunu söylüyor; orada iade varsa oradan uyarlanır, yoksa Tami dokümanına bakılır. Bu işi POS erişimi gelene kadar boş bırak, `tami` dalı "yapılandırılmadı" döndürsün.
- `orders.amount`'un KDV ve indirimden sonra tahsil edilen tutar olduğunu doğrulamak (kod `orders.ts` içinde toplamı yazıyor; iade tutarı için bunun gerçekten ödenen tutar olduğundan emin ol).
- `status = 'paid'` filtresi geçen tüm sorguların taranması (admin sayfası, hesabım, raporlar).
- Admin ekranının görsel ayrıntıları (mevcut `ds.css` bileşenleriyle).

**Benim kararlarım (kontrol et)**
- Sipariş başına tek iade başvurusu (`UNIQUE(order_id)`); reddedilen yeniden açılmaz.
- "Başladı mı" = `hasWatched` kuralı (tamamlanmış ders ya da ≥512 KB akış), yalnızca **satın alma sonrası** ilerlemeye bakılır.
- Admin override: pencere, "başladı" ve (şimdilik değil) kontenjan engelleri aşılabilir; gerekçe zorunlu. Kontenjan engeli (`seats_assigned`) bu sürümde override edilemez: önce kontenjanı elle serbest bırakmak gerekir.
- Hediye sahibi (gönderen) başvurur; alıcıya iade bildirimi gitmez.
- Kupon kullanımı iade edilince tekrar kullanılabilir olur.
- Elle ödemede admin "iade yapıldı" demeden sipariş `paid` kalır, erişim açık kalır; sonuçlandırma o anda olur.

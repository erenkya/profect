# Uzmanlık Programı (Ana Kurs / Bundle) — Tasarım

Tarih: 2026-11-02 · Durum: onay bekliyor

## Amaç ve neden

Kurslar bugün tek tek satılıyor ve her biri kendi sertifikasını veriyor. Coursera'daki "Specialization" mantığıyla, birkaç kursu **tek paket altında** toplayan bir üst yapı eklenecek: **Uzmanlık Programı** (kullanıcının "Ana Kurs"u; arayüz ve kodda "program" denir — ismi kullanıcı değiştirebilir).

- Kullanıcı bir kursu ayrı ayrı alıp sertifikalandırabilir **ya da** programı alabilir.
- Program, içindeki kursların **tamamı** bittiğinde ayrıca kendi sertifikasını verir.
- Program, ayrı ayrı alıma göre **daha ucuzdur**; paketi baştan alan en avantajlı, önce tekil alıp sonra pakete geçen kişi de adil bir fiyat öder, ama baştan paket alana göre bir şey kaybetmemiş olmaz (tekil alımda indirimi kaçırmış olur).

## Hedefler

- Admin program tanımlar: ad, açıklama, kapak, kurs listesi + sıra (roadmap), **kendi sabit fiyatı**, yayın durumu.
- Herkese açık program sayfası: yol haritası (kurs kurs), "ayrı ayrı alsan" karşılaştırması, kişiye özel ödenecek tutar.
- Programı sepete ekleme, ödeme, **hediye etme** (kurs hediyesiyle aynı güvenlik modeli).
- Programa dahil olup olmadığı bilinir (ayrı üyelik tablosu).
- Program sertifikası **otomatik** verilir: kullanıcı programı satın almış olsun ya da kursları ayrı ayrı edinmiş (ya da Plus ile üyelik süresince bitirmiş) olsun, içindeki tüm kursların sertifikasını aldığı anda.
- Kurslar programda **önerilen sırayla** gösterilir (roadmap) ama sıra zorunlu **değildir**; istediği kursu önce bitirebilir.

## Hedef olmayanlar (v1)

- Program final sınavı / bitirme projesi (kullanıcı: sadece tüm kursların bitmesi yeterli).
- Sıra zorunluluğu / kilitli kurslar.
- Programa özel Plus üyeliği veya Plus'a program indirimi (kullanıcı: "Plus satın alımında hiçbir indirim yok").
- Programın kendi müfredatı/dersleri: program yalnızca kursları gruplar.
- Mevcut kullanıcılar için toplu geriye dönük sertifika/üyelik üretimi (aşağıda "Üyelik ve sertifika" içindeki tembel üretim yeterli).
- Admin'den bir kullanıcıyı programa elle ekleme ekranı, iade akışı, admin hediye yönetim ekranı.
- Plus kaynaklı (`source='plus'`) kayıtların üyelik bitince kapanmasının düzeltilmesi (bkz. "Fark edilen mevcut davranış").

## Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- Kullanıcıya iade/borç doğurmak veya negatif tutar çıkarmak.
- Program fiyatının istemciden gelmesi ya da istemcide hesaplanması (her tutar sunucuda DB'den).
- Plus ile geçici açık olan kursların "satın alınmış" sayılıp programın bedava ya da ucuz verilmesi.
- Tüm kursların sertifikası olmadan program sertifikası verilmesi; aynı kullanıcıya aynı program için ikinci sertifika.
- Hediyede göndericinin ya da alıcının hangi kurslara sahip olduğunun sızması ya da fiyata yansıması.
- Aynı kursu içeren iki programın aynı sepette çift ödenmesi.

## Kısıtlar ve mevcut yapı

Next.js 16 — `AGENTS.md`: kod yazmadan önce `node_modules/next/dist/docs/` okunur. MySQL/`mysql2` düz SQL, ORM yok. Migration `db/migrations/018_*.sql` (son: 016_gifts; başka bir dalda commit edilmemiş 017_posts.sql var, bu yüzden 018). Tüm metinler Türkçe. Testler `src/lib/*.test.ts` (`npm test`, saf mantık). Kod haritası:

- **Fiyat/sepet:** `quoteCart` (`src/lib/cart-quote.ts`) fiyatı DB'den hesaplar, "owned" durumunu bilir. Sepet kalemi `CartItem` (`src/lib/cart.ts`) = `course | plus`, localStorage'da yalnızca "ne var" tutulur. `/api/checkout` kuponu sunucuda yeniden hesaplar, toplam ≤ 0 ise sipariş anında tamamlanır; Tami sepeti kalemlere göre `allocateDiscount` ile böler.
- **Sipariş:** `orders`, `order_items` (`item_type ENUM('course','plus')`, `course_id`, `title`, `unit_price`), `createCartOrder` (`src/lib/orders.ts`). Ödeme sonrası her sağlayıcı `fulfillOrder` (`src/lib/lms.ts`) çağırır; kursa erişim `enrollments` satırıdır (`source ENUM('admin','purchase','plus','gift')`, `INSERT IGNORE`).
- **Sertifika:** `certificates` (UNIQUE `user_id,course_id`, `course_id` NOT NULL), `POST /api/client/certificates/generate` (final sınavı geçildiyse üretir), doğrulama `/sertifika/[code]`, PDF `/api/public/certificates/[code]/pdf`, liste `/hesabim/sertifikalarim`, kod üretimi `generateCertificateCode()` (`PRF-YYYY-NNNNNN`).
- **Plus:** `users.plus_until`; `canAccessCourse` Plus aboneliğinde yayındaki her kursa erişim verir ve tembel biçimde `source='plus'` kayıt yazar. `quoteCart` bugün Plus'lı kullanıcının her kursunu "owned" sayar.
- **Hediye:** `gifts` (`course_id NOT NULL`, FK RESTRICT), `createGiftOrder`, `activateGiftForOrder` (`fulfillOrder` içinde), claim akışı `/api/gifts/claim`; ayrıntı için `2026-11-02-course-gifting-design.md`.
- **Admin:** `/admin/kurslar` (+ `CourseBuilder`, dnd-kit ile sıralama), siparişler, kuponlar.

## Tasarım

### Veri (migration 018)

- `programs`: `id`, `slug` (UNIQUE), `code` (UNIQUE, ör. `PRG-101`), `title`, `description`, `category`, `thumbnail_url`, `price DECIMAL(10,2)` (programın kendi fiyatı), `is_published`, `sort_order`, `created_at`, `updated_at`.
- `program_courses`: `program_id`, `course_id`, `sort_order`; PK `(program_id, course_id)`. Bir kurs birden fazla programda olabilir.
- `program_enrollments`: `id`, `user_id`, `program_id`, `source ENUM('purchase','gift','auto')`, `enrolled_at`; UNIQUE `(user_id, program_id)`. "Kullanıcı programa dahil mi?" sorusunun tek cevabı bu tablo.
- `program_certificates`: `id`, `user_id`, `program_id`, `certificate_code` (UNIQUE), `issued_at`; UNIQUE `(user_id, program_id)`. Kod biçimi kurs kodlarından ayırt edilir (ör. `PRP-YYYY-NNNNNN`) ve doğrulama sayfası/PDF iki tür sertifikayı da çözer. (Mevcut `certificates` tablosunu `course_id` nullable yapmak yerine ayrı tablo — builder aksini gerekçelendirirse değiştirebilir.)
- `order_items`: `item_type`'a `'program'`, yeni `program_id` (FK SET NULL).
- `gifts`: `course_id` NULL olabilir hale gelir, yeni `program_id` (FK RESTRICT); satırda ikisinden **tam biri** dolu (uygulama ve migration seviyesinde doğrulanır).

### Fiyat kuralı (kullanıcı tarafından kesinleştirildi)

Program fiyatı `B`, programdaki kursların güncel liste fiyatları toplamı `S`. Geçerli program fiyatı `B' = min(B, S)` ve oran `r = B' / S` (indirimli sayılan çarpan; `S = 0` ise `r = 1`). Böylece admin fiyatı kaydederken `B ≤ S` olsa bile, kurs fiyatları sonradan düşüp `B > S` olursa paket yine tekil toplamdan pahalı çıkmaz (benim kararım).

Kullanıcının **edinilmiş** kurs kümesi `O` için:

```
kredi   = round2( Σ(O içindeki kursların liste fiyatı) × r )
ödenecek = B' − kredi
```

Bu, kalan kursların `r` ile indirimli toplamına eşittir. Örnek: B = 8.000, 10 kurs × 1.000, 8'i edinilmiş → r = 0,8; kredi 6.400; ödenecek 1.600. Hepsi edinilmişse ödenecek 0 (bu durumda programa **ücretsiz** katılır). Sonuç daima `0 ≤ ödenecek ≤ B'` ve ödenecek, kalan kursların liste fiyatları toplamını (`S − Σ O`) aşmaz; yani kalan kursları ayrı ayrı almaktan hiçbir zaman pahalı değildir ve kullanıcıya hiçbir koşulda borç doğmaz. Programın hediyesinde (`O` boş) ödenen tutar `B'`'dür.

**Hangi kurslar sayılır (benim kararım):** `S`, kredi, kayıt yazımı ve "tüm kurslar sertifikalı mı" kontrolü programın **tüm** `program_courses` satırları üzerinden hesaplanır; yayın durumuna göre filtre yoktur, böylece dört yerde de aynı küme kullanılır. Programa kurs eklerken ve programı yayına alırken admin editörü şunları doğrular: (a) kurs yayında olmalı, (b) kursun, soru içeren bir **final sınavı** olmalı (aksi halde o kurs sertifika alamaz ve program hiç tamamlanamaz). Bir program kursu sonradan yayından kalkarsa ya da final sınavını kaybederse program satışa kapanır (`unavailable`, sepete eklenemez, hediye edilemez); zaten üye olanların erişimi ve verilmiş sertifikalar etkilenmez.

- **Edinilmiş** = `enrollments` satırı olup `source ∈ {purchase, gift, admin}`. `source='plus'` olanlar ve salt Plus aktifliği **sayılmaz** (kullanıcı onayı: Plus'ta indirim yok). Düşümde kursun *ödendiği* fiyat değil, *güncel liste fiyatı* esas alınır.
- Kalem satırlarında gösterilen kurs başına indirimli fiyat `round2(fiyat × r)`; kartın/kutunun toplamı yukarıdaki `ödenecek`tir (kuruş yuvarlama farkı toplamda kalmaz).
- Fiyat hesabı saf bir fonksiyonda (`program-pricing.ts`, `server-only` yok) yazılır ve kullanıcının örneğiyle birim testlenir.

### Sepet ve ödeme

- `CartItem`'a `{ type: "program", slug }` eklenir. `quoteCart` program kalemini fiyatlar: kalemin `price`'ı = ödenecek tutar, `oldPrice` = `B`, yeni `children`: kurs kurs `{ title, price(indirimli), listPrice, owned }`.
- Program satırı durumları: `ok`, `owned` (kullanıcı zaten üye), `unavailable` (yayında değil). Tüm kursları edinilmiş ama üye olmayan kullanıcı için `ok`, fiyat 0 (ücretsiz katılım).
- **Aynı sepette** programın üyesi bir kurs de varsa kurs satırı `covered` ("programa dahil") olur ve ödenmez. İki programın sepette ortak kursu varsa programlar sepet sırasıyla fiyatlanır ve önceki programdaki kurslar sonrakinin hesabında **edinilmiş sayılır** (çift ödeme yok).
- Kupon aynen çalışır (sepet toplamına; `allocateDiscount` program kalemini de böler). Tami sepet kalemi alt kategorisi: "Program".
- Sepet kartı ve program sayfası tasarımı **kullanıcı tarafından onaylanan taslağa** göre: sepette tek program kartı, içinde kurslar tek tek; edinilmiş kurslar üstü çizili + "Zaten sende"; kart fiyatı = ödenecek, üstü çizili = `B`. Program sayfasında kişiye özel fiyat kutusu **sepete eklemeden** görünür: "Ayrı ayrı alsan" (S), "Program fiyatı" (B), "Sahip olduğun N kurs" (−kredi), "Ödeyeceğin tutar". Yol haritası satırlarında: "Sende · %ilerleme / tamamlandı" ya da indirimli fiyat + üstü çizili liste fiyatı. Giriş yapmamış kullanıcıya hiçbir kurs "sende" gösterilmez; `S` ve `B` görünür.
- `fulfillOrder` program kaleminde: programın **ödeme anındaki** tüm kurslarına `enrollments` yazar (`source='purchase'`; kullanıcıda `source='plus'` kayıt varsa kalıcı kaynağa **yükseltilir** — `INSERT IGNORE` bunu yapmaz, builder yardımcıyı buna göre yazar) ve `program_enrollments` satırı ekler (`purchase`), ardından sertifika kontrolünü çalıştırır (aşağıda).
- Tüm kursları edinilmiş kullanıcı için ücretsiz katılım: para hareketi olmadığından **sipariş/fatura akışı gerektirmeyen** hafif bir uç (`POST /api/programs/join`, `requireUser`, sunucuda tüm kursların edinilmiş olduğu doğrulanır) yeterlidir. (Benim kararım; builder mevcut %100 kupon yolunu kullanmayı tercih ederse kabul.)

### Üyelik ve sertifika

Tek bir idempotent yardımcı: `ensureProgramProgress(userId, programId?)`. Bir (kullanıcı, program) için kullanıcının programdaki **tüm** kursların `certificates` satırı varsa: `program_enrollments`'a yoksa `auto` ekler, `program_certificates` satırını ekler (UNIQUE ile çift sertifika imkânsız). Çağrıldığı yerler:

1. `generate` endpoint'i bir **kurs** sertifikasını ürettiği (ya da zaten var diye döndürdüğü) anda; o kursu içeren **yayındaki** programlar için.
2. Program satın alma, hediye alma ve ücretsiz katılım sonrası (kullanıcı kursları zaten bitirmiş olabilir).
3. Program sayfası/“Programlarım” okunurken tembel olarak (mevcut kullanıcılar için geriye dönük üretim buradan olur; toplu betik yok).

"Kurs tamamlandı" ölçütü = o kursun **sertifikasının alınmış olması** (final sınavı geçildi). Plus'la edinilen ve üyelik süresince bitirilen kurs da sertifika aldığı için programa sayılır. Sıra önemsizdir. Programa sonradan kurs eklenirse daha önce verilmiş sertifika geçerli kalır; yeni gerekli kursu olmayan kullanıcıya sertifika yalnızca yukarıdaki çağrılardan biriyle üretilir.

### Hediye

- Program da hediye edilebilir; mevcut hediye akışı (`/hediye-et/<slug>` benzeri sayfa, `POST /api/gifts/checkout`, token/mail/claim, gönderen paneli) program için de çalışır. Sayfa yolu ve ortak bileşen ayrımı builder'ın takdiri.
- **Hediye fiyatı = `B`** (tam program fiyatı). Gönderenin ya da alıcının sahip olduğu kurslar fiyata yansımaz ve ödeme ekranında sorgulanmaz (hesap/sahiplik bilgisi sızmasın diye).
- Alma (`claim`) bir programda: hediye `pending` ise ve alıcı **zaten program üyesi değilse** → programdaki tüm kurslara `enrollments` (`source='gift'`, `plus` kaydı varsa yükseltilir) + `program_enrollments` (`gift`) + sertifika kontrolü; alıcının sahip olduğu kurslar etkilenmez. Alıcı zaten üyeyse hediye `pending` kalır ve açık mesaj verilir (kurs hediyesindeki kuralın aynısı).
- Hediye siparişi: tek kalemli `order_items` satırı `item_type='program'`. Gönderen panelinde ve maillerde kurs adı yerine program adı gösterilir (`sendGiftEmails` JOIN'i buna göre genişler).

### Arayüz ve yönetim

- Herkese açık: `/programlar` (liste) ve `/programlar/[slug]` (detay: yol haritası, fiyat kutusu, "Sepete ekle", "Hediye et"). Ana sayfa/kurs listesine görünürlük builder'ın takdiri.
- Hesabım: "Programlarım" — üye olunan programlar, kurs bazlı ilerleme (ör. 3/5 kurs tamam), program sertifikası. Program sertifikası `/hesabim/sertifikalarim`'da kurs sertifikalarıyla birlikte listelenir.
- Kurs öğrenim sayfasında kurs bir programın parçasıysa küçük bir "Bu kurs X programının parçası" bağlantısı (builder'ın takdiri: yer ve görünüm).
- Sertifika: program sertifika sayfası/PDF'i program adını ve içerdiği kursları gösterir; doğrulama kodu ile açılır (`/sertifika/[code]` iki türü de çözer).
- Admin: `/admin/programlar` (liste) ve düzenleme — başlık/açıklama/kapak/fiyat/yayın, kurs ekle-çıkar-sırala (dnd-kit zaten var), kurs listesi toplamı `S` ve hesaplanan indirim yüzdesi canlı gösterilir; `B > S` kaydedilemez (uyarı). Siparişler ekranında program kalemi kalem adıyla görünür.

### Güvenlik

- Fiyat, kredi, sahiplik ve sertifika uygunluğu yalnızca sunucuda; istemciden yalnızca "hangi program" (slug) gelir.
- Program sertifikası ve üyelik, kullanıcı oturumundaki `userId` ile hesaplanır; başka kullanıcının id'siyle işlem yapılamaz.
- Hediye için mevcut token/doğrulanmış-mail modeli aynen geçerlidir; fiyat ve hata mesajları sahiplik bilgisi sızdırmaz.

## Fark edilen mevcut davranış (kapsam dışı, bilgi için)

`canAccessCourse` önce `enrollments` satırına bakar ve Plus ile açılmış `source='plus'` satırlar Plus bittikten sonra da erişim vermeye devam eder (satır silinmiyor/süresi kontrol edilmiyor). Bu tasarım bunu değiştirmez ama fiyat kuralı `source='plus'` kayıtları "satın alınmış" saymayarak sonucunu doğru tutar. Düzeltilmesi ayrı bir iştir.

## Test

- Saf mantık (`src/lib/*.test.ts`): `program-pricing` (kullanıcının 8.000/10×1.000 örneği, hiç/hepsi edinilmiş, farklı fiyatlı kurslar, `S=0`, `B>S`, kuruş yuvarlama, `0 ≤ ödenecek ≤ B`), sepette ortak kurslu iki program sıralı fiyatlama, "tüm kurslar sertifikalı mı" kararı.
- Elle/uçtan uca (mevcut `scripts/test-*.mjs` desenine benzer bir betik): program satın alma (mock sağlayıcı) → kurslar açıldı + üyelik; kısmi sahiplikle fiyat düşümü; tüm kursları ayrı ayrı alıp bitirme → otomatik üyelik + program sertifikası; Plus'la bitirme → program sertifikası; `plus` kaynaklı kaydın satın almada yükseltilmesi; program hediyesi (alma, zaten üye, alıcıda kısmi sahiplik); çift sertifika yarışı.

## Builder'a bırakılanlar

- Dosya/route adlandırması, hediye sayfasının ortak bileşenlere bölünmesi, sepet/ödeme bileşenlerinin `children` gösterimi.
- Ana sayfa/kurs listesinde programların nasıl öne çıkarılacağı, program kartı tasarımı, kurs sayfasındaki "programın parçası" bağlantısının yeri.
- Program sertifikası PDF tasarımı (mevcut `certificate-pdf.ts` temel alınarak).
- Ücretsiz katılımın uç noktası mı yoksa %100 kupon yolu mu olacağı (yukarıdaki öneri varsayılan).
- Admin sipariş listesinde hediye/program işareti.

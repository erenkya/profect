# Kariyer Yolculuğu Dil Revizyonu — Tasarım

## Amaç ve neden
Profect bugün "kurs al, sınava gir, sertifika al" diyen klasik bir eğitim platformu gibi konuşuyor. İstenen: ziyaretçinin mesleğinde bir adım ilerlediği, kariyer yolculuğu hissi veren bir platform. Referans: kullanıcının paylaştığı ana sayfa mockup'ı (WhatsApp Image 2026-11-23 at 17.57.46.jpeg). **Tasarım (koyu tema, yeşil vurgu) taklit edilmez**; mevcut açık tema ve bileşen dili korunur. Mockup'tan alınan şeyler: sloganlar, anlatı akışı, bölüm kurgusu ve fotoğraf yönü.

Kullanıcı kararları: dil değişimi **total** olacak (ana sayfa ile sınırlı değil); **fonksiyonel kayıp olmayacak**.

## Hedefler
- Ana sayfa mockup'taki akışı izler: hero (Mesleğiniz değişiyor. Siz ne kadar hazırsınız?) → Knowledge → Decision → Impact şeridi → "Bunlardan hangisi sizin gündeminizde?" → "Learn from people who've actually done it" → referans logoları → mevcut bölümler (eğitimler, uzmanlık alanları, uzman görüşmesi, blog/haber).
- Sitedeki görünen metinler (menü, alt bilgi, liste/detay sayfaları, giriş-kayıt, hesabım, sepet, hediye, öğrenim ekranı, meta açıklamalar, e-posta ve bildirim metinleri) yeni terim tablosuna göre yeniden yazılır.
- Mevcut her işlev (satın alma, hediye, şirket kontenjanı, sınav, sertifika doğrulama, uzman görüşmesi, blog/haber) aynı rotalardan aynı şekilde çalışır.

## Hedef dışı
- Görsel tasarım değişikliği: koyu tema, renk paleti, yeni font.
- URL/rota yeniden adlandırma (`/kurslar`, `/programlar`, `/hesabim/kurslarim`, `/sertifika/[code]` aynı kalır).
- Veritabanı, tablo adları, kod değişken/dosya adları, API yolları.
- Hukuki metinler: mesafeli satış sözleşmesi, teslimat-iade-iptal, KVKK, gizlilik, çerez, içerik ve telif bildirimi (içlerinde "kurs" geçmeye devam eder).
- Yönetici paneli (`/admin/*`, `/egitmen/*`) metinleri.
- Admin'in DB'ye girdiği içerikler (kurs/program adları, açıklamaları, ders içerikleri, blog yazıları).
- Yeni özellik: yeni sayfa, yeni veri modeli.

## Anti-hedefler
- Eski linklerin, ödeme dönüşünün, e-posta bağlantılarının veya yayınlanmış sertifika PDF'lerindeki QR'ların kırılması.
- Fonksiyonel etiketlerin (ödeme, iade, sertifika doğrulama, hata mesajları) pazarlama diline kayıp anlaşılırlığı düşürmesi.
- Mockup'taki uydurma içeriğin (alıntı, logo) onay ve izin olmadan yayına girmesi.

## Kısıtlar / mevcut yapı
- Next.js 16.4.6 (AGENTS.md: kod yazmadan önce `node_modules/next/dist/docs/` okunacak).
- Eski dil geniş yayılmış: "kurs" ~126 dosyada, "sertifika" ~49, "sınav" ~27 (src/ altında, admin dahil).
- Ana sayfa `src/app/page.tsx`; menü `src/components/Nav.tsx`; alt bilgi `Footer.tsx`; CTA `Cta.tsx`; hesabım menüsü `components/account/items.ts`; adım verisi `STEPS` ve kurucu verisi `FOUNDERS` `src/data/courses.ts`; uzman verisi `src/data/experts.ts`; site meta açıklaması `src/app/layout.tsx`.
- Menüde bugün `/#sertifika` linki var ama ana sayfada bu id'li bölüm yok (bozuk link).
- `/sirket` yalnızca şirket yöneticisine açık panel; herkese açık bir "Kurumsal" sayfası yok.
- Mockup görseli 1536×1024, fotoğraf mockup içinde ve üzerinde arayüz katmanları var; doğrudan kullanılamaz.
- Mevcut hero fotoğrafları: `public/images/hero/` (3 slayt).

## Yaklaşımlar
1. **Yalnızca görünen dil değişir (seçildi).** URL, DB, kod adları aynı kalır. Kırılma riski neredeyse sıfır, test script'leri bozulmaz. Eksi: adres çubuğunda `/kurslar` kalır.
2. Dil + URL taşıma (`/kurslar` → `/egitimler` vb., kalıcı yönlendirmeyle). Reddedildi (şimdilik): QR/e-posta/ödeme dönüşü kırılma riski, dokunulan dosya sayısı artar. Ayrı bir iş olarak sonra ele alınabilir.
3. Önce merkezi metin sözlüğü. Reddedildi: tek seferlik değişim için gereksiz yapı, zaten ~100 dosyaya dokunuluyor.

## Terim tablosu (kullanıcıya görünen metin; **builder'ın çağrısı**, kullanıcı itiraz edebilir)
| Eski | Yeni | Not |
|---|---|---|
| Kurs / kurslar | Eğitim / eğitimler | Mockup menüsü "Eğitimler" diyor. |
| Program / uzmanlık programı | Uzmanlık alanı | Mockup menüsü "Uzmanlık Alanları" diyor. |
| Kurslarım / Programlarım | Eğitimlerim / Uzmanlık Alanlarım | Rota aynı. |
| Sertifika | Sertifika (kalır) | İşlev adı; doğrulama sayfası, hesabım, PDF'te net terim. Pazarlama vaadi olmaktan çıkar, "hazır oldun" kanıtı olarak çerçevelenir. |
| Final sınavı / modül sınavı | Aynı | Öğrenim ekranında işlev etiketi; pazarlama metinlerinde "kendini sına/karar ver" tonu. |
| Ders, modül | Aynı | Yapısal terim. |
| Kayıt ol / Giriş yap | Aynı | İşlev butonu; alt metinler yeni dilde. |

### Terim kuralı: tanıtım dili ve satın alma dili (builder'ın çağrısı)
Kullanıcının kabul ettiği hukuki metinler "kurs" ve "program" diyor; ödeme anında farklı bir terim görmek güveni ve anlaşılırlığı düşürür. Bu yüzden iki bağlam ayrılır:
- **Tanıtım/keşif dili (yeni terimler):** menü, ana sayfa, liste ve detay sayfalarının başlık ve anlatı metinleri, hesabım menü etiketleri, giriş/kayıt alt metinleri, hakkımızda, CTA, meta açıklamaları.
- **İşlem dili (eski terimler kalır):** sepet, ödeme ve ödeme sonucu, sipariş satırları ve sipariş detayı, iade/iptal ekranları, sipariş ve hediye e-postaları, hediye kabul metinleri, sertifika PDF'i ve doğrulama sayfası, `sertifikalarim` ve sipariş `ITEM_TYPE` etiketleri.
- **Program adı:** keşif alanında "Uzmanlık Alanı", satın alma ve sertifika bağlamında "Uzmanlık Programı" (ör. "Uzmanlık Programı Sertifikası" aynen kalır). Kullanıcı mockup menüsünde "Uzmanlık Alanları" diyor; satın alınabilir paket olduğu için işlem anında "program" kalması anlaşılırlığı korur.
- Sertifika PDF şablonu ve QR/doğrulama yolu değişmez.

## Sayfa sayfa değişiklikler

**Menü (Nav):** Eğitimler (`/kurslar`) · Uzmanlık Alanları (`/programlar`) · Kurumsal · Hakkımızda · Kaynaklar. Bozuk "Sertifikalar" linki kalkar. Blog ve Haberler "Kaynaklar" altında açılan alt menüde kalır (iki rota da erişilebilir kalır). "Kurumsal" mevcut `/#uzman-gorusme` bölümüne gider; yeni sayfa açılmaz. Bölümün başlığı/alt metni kurumsal ihtiyaçla gelen ziyaretçiyi de karşılayacak şekilde ("ekibiniz için", "kurumunuz için") hafifçe yeniden yazılır, görüşme akışı aynı kalır. Giriş Yap, Kayıt Ol, sepet, profil menüsü aynı.

**Hero:** Kicker "Perfect Your Profession." (marka sloganı korunur). H1 "Mesleğiniz değişiyor. / Siz ne kadar hazırsınız?" (ikinci satır vurgu rengiyle). Alt metin: gerçek iş deneyimiyle geliştirilmiş eğitimler; güncel bilgi, uygulanabilir modeller, yeni nesil öğrenme. Birincil buton "Keşfetmeye Başla" → `/kurslar`. Altında Knowledge → Decision → Impact şeridi. Sağdaki kompozisyon kartları yeniden çerçevelenir: ilerleme kartı "yol haritası/aşama", final sınavı kartı "yetkinlik değerlendirmesi", sertifika kartı aynı işlevle ("Sertifikan hazır" → yolculuğun kanıtı). Mevcut 3 hero fotoğrafı yerinde kalır; yeni fotoğraf için yuva hazır (bkz. Kullanıcıdan beklenenler).

**Gündem bölümü (yeni):** "Şu anda profesyonellerin çözmeye çalıştığı problemler / Bunlardan hangisi sizin gündeminizde?" Mockup'taki 6 kart: maliyetleri düşürmek, tedarikçi riskini yönetmek, daha iyi müzakere etmek, AI'ı işimde kullanmak, stratejik karar almak, veriden daha iyi yararlanmak. Kartlar bir **problem/gündem** ifadesidir, belirli bir eğitimin vaadi değildir; hepsi `/kurslar`'a gider (kategori filtresi bağlantısı yok). Gerçek katalog üretim veritabanında olduğundan (repodaki seed demo veridir) kart listesi tek bir veri dizisinde tutulur; sahibi listeyi katalogla karşılaştırıp kolayca kısaltır/değiştirir. Builder katalog denetimi yapmaz. Mevcut ikon seti (lucide-react).

**Nasıl çalışır (`STEPS`, `#nasil` anchor'ı kalır):** "Kayıttan sertifikaya üç adım" yerine Bilgi → Karar → Etki. Bilgi: video ders, okuma, vaka, uygulamalı ödev. Karar: modül ve final sınavlarıyla kendini sına, sonuç anında. Etki: doğrulanabilir sertifika, QR, PDF, LinkedIn paylaşımı. Üç işlevin hepsi görünür kalır.

**Kurucular bölümü:** "Gerçek deneyim. Gerçek sonuçlar. / Learn from people who've actually done it." Teori değil, gerçek kararlar/problemler/deneyim satırları. İki kurucu mevcut `FOUNDERS` verisi ve fotoğraflarıyla kalır; "Hikâyeyi oku" → `/hakkimizda`. Alıntı alanı `FOUNDERS` verisinde opsiyonel; **yalnızca kurucuların onayladığı metin girilirse** gösterilir, yoksa mevcut bio özeti kalır.

**Referans şeridi (yeni, "Deneyimimiz, gücümüz"):** Logo dizisiyle çalışan bileşen. **Logo dosyası verilmeden gösterilmez** (dizi boşsa bölüm render edilmez). Üçüncü taraf marka adı düz yazıyla logo yerine kullanılmaz.

**Diğer ana sayfa bölümleri:** Öne çıkan eğitimler ("Kariyerine değer katan kurslar" → eğitim dilinde), uzmanlık alanları, uzman görüşmesi, blog/haber başlıkları ve eyebrow'ları yeni terimle. Bölüm numaraları ve sıra yeni akışa göre güncellenir. Marquee kalır.

**Liste/detay sayfaları:** `/kurslar` ("Tüm kurslar" → "Tüm eğitimler"), `/programlar` ("Uzmanlık programları" → "Uzmanlık alanları"), eğitim ve uzmanlık alanı detayları, hediye et sayfaları, kart ve satın alma paneli etiketleri, sepet/ödeme sonucu bilgilendirme metinleri.

**Hesap ve auth:** `items.ts` etiketleri, giriş ("Eğitimlerine ve sertifikalarına eriş"), kayıt ("Ücretsiz kaydol, yolculuğunu başlat"), hesabım sayfa başlıkları ve boş durum metinleri, hediye alma sayfaları, şirket paneli görünen metinleri.

**Öğrenim ekranı (`/ogrenim/*`):** Yalnızca başlık/boş durum gibi çerçeve metinleri; ders ve sınav işlev etiketleri anlaşılırlık için aynı kalır.

**Hakkımızda:** Başlık "Öğrenmeyi ölçülebilir kılmak için kurduk" yerine kariyer yolculuğu dilinde yeniden yazılır; kurucu bio'ları aynı.

**Alt bilgi ve CTA:** Alt bilgi "Platform" sütunu: Eğitimler, Uzmanlık Alanları, Kaynaklar (Blog, Haberler). Hukuki linkler aynı. CTA "İlk sertifikan bir kurs uzağında" → "Bir sonraki adımın bir eğitim uzağında" (düzeltilmiş buton "Eğitimleri incele").

**Meta:** `layout.tsx` title/description, sayfa `metadata` açıklamaları, `opengraph-image` ve sertifika sayfasının sosyal önizleme metinleri yeni dile uyar. Sertifika doğrulama metinleri net kalır.

**E-postalar ve bildirimler (`src/lib/mail.ts` ve ilgili şablonlar):** Görünen "kurs/program" terimleri yeni tabloyla; işlev bilgisi (sipariş, iade, hediye linki, doğrulama kodu) değişmez.

## Doğrulama
- `npm run typecheck`, `npm test` (birim testler), `npm run build` temiz.
- Mevcut `test:*` script'leri metin içeren iddialar için kontrol edilir; metne bağlı ifadeler varsa test güncellenir, davranış testi değişmez.
- Elle kontrol: ana sayfa, `/kurslar`, bir eğitim detayı, sepet → ödeme sonucu, giriş/kayıt, hesabım menüsü, hediye akışı, sertifika doğrulama, uzman görüşmesi planlama, menü mobil görünüm.
- Eski terimlerin kalan görünen metinlerde taranması (kasıtlı muaf yerler: hukuki metinler, admin, DB içeriği).

## Kullanıcıdan beklenenler (uygulamayı bloke etmez)
- Hero için temiz fotoğraf (mockup'taki kadın/erkek sahnesinin kaynak dosyası). Gelene kadar mevcut hero görselleri kalır.
- Referans logoları (Siemens, DHL, Borusan, Benteler, Zorlu, Tırsan ya da onaylananlar) ve kullanım izni. Gelene kadar şerit gösterilmez.
- Tuğrul Günal ve Kaan Tunçbilek'in onayladığı alıntı metinleri. Gelene kadar alıntı gösterilmez.

## Dil kararı: İngilizce sloganlar
Mockup'taki "Perfect Your Profession.", "Knowledge → Decision → Impact" ve "Learn from people who've actually done it." İngilizce kalır (marka sloganı ve mockup'ın kendi tercihi); hemen altında Türkçe karşılığı/destek satırı yer alır ("Gerçek deneyim. Gerçek sonuçlar."; adım başlıklarında Bilgi / Karar / Etki). SEO ve meta metinleri Türkçe kalır.

## Builder'a bırakılanlar
- Terim tablosunun uç durumları (çoğul/hal ekleri, "kursun", "kurslarında" gibi çekimler) ve cümle akışı.
- Kaynaklar alt menüsünün mobil davranışı.
- Hero kartlarının ve gündem kartlarının mikro metinleri, ikon seçimi.
- E-posta şablonlarında hangi satırların pazarlama, hangilerinin işlev metni olduğu.

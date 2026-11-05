# Şirket Paneli: Program Kontenjanı ve Toplu Atama: Tasarım

Tarih: 2026-11-05 · Durum: uygulandı (2026-11-05). Uygulama sapmaları: ana admin dışında `test:api` çalıştırılamadı; panel arayüzü tarayıcıda elle görülemedi (yalnızca sunucu çıktısı doğrulandı); yeni sunucu export'ları dev sunucusunun görmesi için yeni modüllere kondu (`program-seat-rules.ts`, `program-seat-orders.ts`, `company-matrix.ts`, `company-buyable-programs.ts`, `company-program-progress.ts`, `company-watch.ts`, `company-lock.ts`)

Önceki belge: `2026-11-03-company-accounts-design.md` (şirket hesapları ve kurs kontenjanı). Bu belge onu genişletir; orada "bu sürümde değil" denen **program kontenjanını** ekler ve atamayı **toplu** yapar. Dil Türkçedir; arayüz metinleri ve kod yorumları mevcut koddaki gibi Türkçe-İngilizce karışık kalır. "Karar" etiketli maddeler ürün sahibinin söyledikleridir; "Benim kararım" etiketliler tasarımcının doldurduğu boşluklardır.

## 1. Amaç ve neden

Bugün şirket paneli yalnızca tek kurs kontenjanıyla çalışıyor ve atama satır satır yapılıyor: her kurs satırında tek bir çalışan seçilip "Ata"ya basılıyor. İki sorun var:

1. Şirketler yalnızca kurs değil **Uzmanlık Programı** da (birden çok kursu paketleyen yapı) satın alıp çalışanlarına verebilmeli. Panelde programla ilgili hiçbir şey yok.
2. 20 çalışana 4 eğitim dağıtmak 80 ayrı işlem demek. Şirket yöneticisi çalışanları ve eğitimleri **toplu** seçip tek seferde atayabilmeli.

Başarı ölçütü: yönetici bir program kontenjanı satın alıp, tek ekranda birkaç çalışana birkaç kurs ve programı aynı anda dağıtabiliyor; başlanmış bir eğitimi geri almaya çalışınca ne kaybedeceğini açıkça görüyor.

## 2. Kararlar (ürün sahibinden)

- **Program satın alınabilir**, tıpkı kurs kontenjanı gibi: şirket kaç kişilik program istediğini yazar, mevcut ödeme akışıyla öder, ödeme onaylanınca şirketin o programdaki kontenjanı artar.
- **Toplu atama ekranı: matris.** Satırlar çalışan, sütunlar eğitim ve program; kutucuklar işaretlenir, sonda "Uygula" ile hepsi birden atanır. Sütun altında "Kalan" kontenjan sayısı görünür. Birden çok kişiye birden çok eğitim aynı anda dağıtılabilir. (Taslak ekranı ürün sahibi gördü ve C'yi seçti.)
- **Geri alma matrisle yapılmaz.** Şimdiki gibi "Çalışanlar ve ilerleme" listesinde kalır.
- **Başlanmış eğitimin uyarısı:** çalışan eğitime (ya da programdaki bir kursa) başlamışsa geri alma isteği şu bilgiyi veren bir uyarı çıkarır: hak kaybolacak; başlanmış eğitim **geri alınamaz, yalnızca silinebilir**; destek için **info@profect.com.tr** adresine e-posta atılabilir. Kurs için de program için de, ayrıca başlamış üyenin şirketten çıkarılması için de geçerlidir.

## 3. Hedefler, hedef olmayanlar, istenmeyen sonuçlar

**Hedefler**
- Programın kontenjanı: satın alma, ana adminin tanımlaması, panelde toplam/atanan/boş/yanan görünmesi.
- Programı çalışana atamak: çalışan programa ve programdaki tüm kurslara kayıt olur.
- Matristen çoklu atama (kurs ve program sütunları birlikte).
- Programlar için geri alma ve yanma kuralı; başlanmış eğitim uyarısı yeni metinle.

**Hedef olmayanlar (bu sürümde)**
- Çalışanın şirkete programı **talep etmesi** (talepler yalnızca kurs için kalır).
- Programa özel son tarih. Son tarih/rapor çalışması yalnızca kurs için kalır; programın kursları kendi kurs son tarihlerini taşır. (Benim kararım.)
- Toplu alım indirimi. Program birim fiyatı × adet. (Önceki belgedeki karar.)
- Atamayı matristen geri alma.

**İstenmeyen sonuçlar (teknik olarak çalışsa bile başarısızlık sayılır)**
- Bir şirket admini başka şirketin verisini görüp değiştirebiliyorsa.
- Son boş kontenjan iki kişiye verilebiliyorsa (toplu atama dahil, iki yönetici aynı anda uyguladığında).
- İzlenmiş bir eğitimin hakkı uyarısız geri alınıp yeniden verilebiliyorsa.
- Toplu atamada bir kutucuk hata verince hiçbir şey olmuyor ya da hangisinin neden atanmadığı belirsiz kalıyorsa.
- Program geri alınırken çalışanın başka yoldan (kendi satın aldığı, hediye, başka bir şirket ataması) sahip olduğu kurs erişimi silinirse.

## 4. Davranış

### 4.1 Program kontenjanı
- Kontenjan, kurstakiyle aynı mantıkla işler: toplam − atanan − yanan = boş. Kurs ve program kontenjanları ayrı havuzlardır. Programı almak, programdaki kursların kontenjanını **artırmaz**.
- **Kaynaklar:** satın alma (sipariş ödenince) ve ana admin tanımı (negatif olabilir; toplam atanan+yanandan aşağı inemez, kurstaki kural).
- **Fiyat (benim kararım):** birim fiyat = programın bugünkü satış fiyatı (programın kendi fiyatı, kurs listesi toplamını aşamaz; programın zaten kullandığı `priceProgram` hesabı, hiçbir kurs edinilmemiş varsayımıyla). Toplam = birim × adet, sunucuda DB'den hesaplanır, kupon yoktur. Ücretsiz (0 TL) ya da satışa uygun olmayan (`sellable` false) programın kontenjanı satın alınamaz.
- Şirket kontenjanı satın alma yalnızca şirket adminlerine ve ana admine açıktır (şimdiki kural).

### 4.2 Program atama
- Atama, çalışanı `program_enrollments`'a (kaynak `company`) ve programdaki her kursa `enrollments`'a (kaynak `company`) yazar; mevcut `enrollInProgram` mantığı genişletilir. Zaten başka kaynaktan (satın alma, hediye, admin) sahip olduğu kursun kaynağına dokunulmaz.
- **Zaten sahip kuralı (benim kararım):** çalışan o programın üyesiyse atama reddedilir. Programdaki bazı kurslara zaten sahipse atama **yapılabilir**; program kontenjanından bir hak düşer (kısmi indirim yoktur).
- Sertifikalar normal işler: program sertifikası, programdaki tüm kursların sertifikası alınınca verilir (`ensureProgramProgress`). Atamadan sonra çağrılır.
- Şirket admini kendine de program atayabilir (kurstaki kuralın aynısı).

### 4.3 Matris (toplu atama)
- Satırlar şirketin **onaylı** üyeleri (adminler dahil). Sütunlar şirketin kontenjanı olan kurslar ve programlar (programlar kurslardan ayrı bir grup başlığı altında). Sütun başlığında ad, kurs/program etiketi ve "Daha fazla al" bağlantısı olur.
- **Kutucuk durumları:** boş (işaretlenebilir) · işaretli (bekleyen) · "atandı" (şirket zaten atamış, değiştirilemez) · "zaten sahip" (başka yoldan sahip, işaretlenemez) · "hakkı yandı" (işaretlenemez) · sütunda boş kontenjan kalmadıysa kalan boş kutucuklar kapalı.
- Altta her sütun için **Kalan** sayısı, işaretledikçe canlı düşer; kalan 0 olunca o sütunda yeni işaret konamaz.
- **Uygula:** toplam bekleyen atama sayısını gösterir ("7 atamayı uygula"). İsteğe bağlı tek bir "son tarih" alanı vardır; doluysa bu seferdeki **kurs** atamalarının hepsine çalışana özel son tarih olarak yazılır (programlara uygulanmaz). (Benim kararım: mevcut satır içi son tarih alanı matrise taşınır; atama başına ayrı tarih yoktur, o hâlâ "Çalışanlar ve ilerleme" listesinden düzenlenir.)
- **Kısmi başarı (benim kararım):** her kutucuk kendi içinde başarılı/başarısız olur. Atanamayan varsa (kontenjan bitti, çalışan o sırada çıkarıldı, başka yönetici aynı anda aldı) o kutucuk atanmaz, diğerleri yazılır; sonuçta "5 atandı, 2 atanamadı" ve her başarısızın nedeni (çalışan + eğitim + neden) listelenir. Başarısızlar işaretli kalmaz.
- Çok sütun/satır: ilk sütun (çalışan) sabit, yatay kaydırma. Telefon genişliğinde de kullanılabilir olmalı.
- Eski satır içi "Çalışan seç + Ata" kontrolleri kaldırılır; matris bunun yerine geçer. Kontenjanlar tablosu (toplam/atanan/boş/yanan) kalır, programlar da orada ayrı grupta görünür. (Benim kararım.)

### 4.4 Geri alma ve uyarı
- **Yer:** "Çalışanlar ve ilerleme" listesindeki "Kontenjanı geri al" düğmesi. Program atamaları da bu listede satır olarak görünür (eğitim sütununda program adı ve "Program" etiketi; ilerleme programdaki kurs sayısı üzerinden "2/4 kurs"; sertifika sütununda program sertifika kodu).
- **Başlanmamışsa:** uyarı yok, kontenjan havuza döner (şimdiki kural).
- **Başlanmışsa** ("izlenmiş" tanımı değişmez: ders tamamlanmış ya da akış eşiği aşılmış; program için programdaki **herhangi bir** kurs yeter): işlem yapılmaz, uyarı penceresi açılır. Onaylanırsa erişim kapanır ve hak **yanar** (başka kişiye verilemez). İlerleme ve sertifika silinmez.
- **Uyarı metni (taslak, ürün sahibi değiştirebilir):**
  - Başlık: "Bu eğitim geri alınamaz, yalnızca silinebilir"
  - Gövde: "**{Ad}** bu eğitime başlamış: **{Eğitim}**. Başlanmış bir eğitim geri alınamaz, yalnızca silinebilir. Silerseniz çalışanın erişimi kapanır ve bu eğitimin hakkı kaybolur; başka bir kişiye verilemez. Destek için info@profect.com.tr adresine e-posta gönderebilirsiniz."
  - Düğmeler: "Vazgeç" ve "Yine de sil".
  - Üyeyi şirketten çıkarma uyarısı aynı bilgiyi ve aynı e-posta adresini taşır (çoğul eğitim adlarıyla).
  - E-posta adresi tek bir yerde (sabit) tutulur; mailto bağlantısı olur.
- **Üye şirketten çıkarılırken** kurs atamalarının yanında program atamaları da aynı kuralla işlenir (başlanmamışsa havuza döner, başlanmışsa onayla yanar; birden çok atamada hepsi tek uyarıda listelenir).
- **Program geri alınırken ne silinir (benim kararım, kritik):** program üyeliği (`company` kaynaklı) ve programın kurslarındaki `company` kaynaklı kurs kayıtları silinir; **ancak** bir kurs kaydı, çalışanda hâlâ aktif başka bir şirket ataması (kurs ataması ya da başka bir program ataması) tarafından karşılanıyorsa silinmez. Başka kaynaklı kayıtlar (satın alma, hediye, admin) hiçbir zaman silinmez.

### 4.5 Satın alma
- Panelde "Yeni kontenjan al" seçicisi kursların yanında programları da listeler (kurs/program ayrı gruplar). Kontenjanlar tablosu ve matris sütunlarındaki "Daha fazla al" programlar için de çalışır.
- Ödeme akışı kurstakiyle aynıdır (kart, fatura bilgisi, sonuç sayfası). Sonuç sayfası ve siparişlerim sayfası program kontenjan siparişini doğru gösterir ("N kişilik program kontenjanı").
- Ödeme onaylanınca `fulfillOrder` program kaydı **açmaz**, şirketin program kontenjanını artırır; `UNIQUE(order_id)` çift yazımı engeller.

### 4.6 Ana admin
- Admin tarafındaki şirket sayfası aynı paneli kullanır (`platform`): "Kontenjan tanımla" kutusu programları da seçebilir. Matris ana admin görünümünde de çalışır (ana admin her şirket adına atayabilir; şimdiki yetki kuralı).

### 4.7 Üyelerin bireysel satın alması (2026-11-05, ürün sahibinden)
- Şirkete bağlı (onaylı) üyeler **ve şirket adminleri** hem şirketlerinden eğitim **talep edebilir** hem de **kendileri satın alabilir** ve hediye edebilir. Önceki belgedeki "üye kendi parasıyla kurs alamaz" kısıtı kalkmıştır.
- Kurs kartında ve kurs sayfasında "Hemen Satın Al", "Sepete Ekle" ve "Şirketimden talep et" birlikte görünür.
- Talebi bekleyen üye o kursu kendisi edinirse talep şirket panelinin "Bekleyenler" listesinde görünmez; çözme denemesi 409 `already_owned` verir. (Benim kararım.)
- Süresi dolduğu için erişimi kapanmış şirket kaydı olan kullanıcıya kurs sayfasında mevcut "süre doldu" açıklaması gösterilmeye devam eder (kayıt var olduğundan yeniden satın alınamaz). (Benim kararım.)

## 5. Kısıtlar

- `AGENTS.md`: kullanılan Next.js sürümü bilinenden farklıdır. Kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili rehber okunmalı.
- **Çalışma ağacı:** başkasının tamamlanmamış "son tarih / rapor" çalışması (`023_company_deadlines.sql`, `due-rules`, `progress-report`, `DueEditor`, değişen `CompanyPanel.tsx` / `company-seats.ts` / `assignments/route.ts` / `lms.ts`) var. Bu iş onun **üzerine** kurulur; o değişiklikler bozulmaz, geri alınmaz. Çakışan dosyalarda mevcut hâl okunup ona göre düzenlenir.
- Mevcut veri bozulmaz. Göç dosyası geriye dönük uyumlu, yeniden çalıştırılabilir, yalnızca ekleyici olur (sıradaki numara 024; 023 başkasının).
- Fiyat daima sunucuda DB'den hesaplanır; kart verisi saklanmaz; ödeme sağlayıcı soyutlaması (`src/lib/payment`) kullanılır.
- Şirket yetkisi DB'den (üyelik tablosundan) doğrulanır; JWT rolü tek başına yetmez (`requireCompanyAccess`).
- Eşzamanlılık: şirketi `FOR UPDATE` ile kilitleyen mevcut kalıp program atama ve geri alma için de geçerli; toplu atamada her kutucuk aynı kilit altında sırayla işlenir.

## 6. Oluşturucuya bırakılanlar

- Veri modeli: program kontenjanı için tablolar/sütunlar (kurs tablolarını genelleştirmek ya da paralel `company_program_*` tabloları açmak), `program_enrollments.source`'a `company` eklenmesi, `order_items.item_type`'a program kontenjanı için yeni değer, sepete adet. Mevcut kurs kontenjan sorguları ve `company_assignments.course_id NOT NULL` varsayımları bozulmamalı.
- API yüzeyi: toplu atama için tek uç nokta (öneri: `POST /api/company/[id]/assignments/bulk`, `[{user_id, course_id | program_id}]`, üst sınır koyun, ör. 500; sonuç kutucuk başına başarı/neden). Program kontenjanı satın alma ve ana admin tanımı uçları. Program satın alma sayfası yolu.
- Saf kurallar (`*-rules.ts` + `node --test`): program atama engeli, program geri alma kararı (hangi kurs kaydı silinir, hangisi korunur), toplu atama sonucunun gruplanması, matris kutucuk durumu. Test stratejisi: mevcut `scripts/test-company.mjs` kalıbı; program atama/geri alma/satın alma ve toplu atamanın kısmi başarısı uçtan uca denenmeli.
- Matristeki canlı "Kalan" sayacının ve işaret kısıtının istemci tarafı gerçekleşmesi (nihai doğrulama her zaman sunucuda).
- Atama sonrası `ensureProgramProgress` çağrısının yeri (commit sonrası, hatası atamayı bozmasın).
- Kontenjanlar tablosunda programların sunumu ve `getCompanyPanelData`'nın genişlemesi.
- Uyarı pencerelerinin metin sabiti ve `ReclaimDialog`'un yeni başlık/düğme etiketini alması.
- Kapsam dışı bırakılan raporlama (son tarih/rapor çalışması) program atamalarını göstermeyebilir; bu bilinçli bir sınırdır.

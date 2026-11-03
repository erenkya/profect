# Şirket (Kurumsal) Hesapları ve Kontenjan Sistemi: Tasarım

Tarih: 2026-11-03 · Durum: onay bekliyor

Bu belge, Profect LMS'e şirket hesapları eklenmesini anlatır. Bir ürün sahibiyle yapılan konuşmadan çıkmıştır. "Karar" etiketli maddeler ürün sahibinin söyledikleridir. "Benim kararım" etiketli maddeler konuşmada geçmeyen, tasarımcının doldurduğu boşluklardır ve ürün sahibi bunları onaylamadıkça kesin değildir. Belgenin dili Türkçedir. Arayüz metinleri, kod yorumları ve değişken adlandırması mevcut koddaki gibi Türkçe-İngilizce karışık kalır.

## 1. Amaç ve neden

Şirketler çalışanları için toplu eğitim almak istiyor. Bugün sistemde şirket kavramı yok. Her kullanıcı tek başına satın alıyor, tek başına öğreniyor. Şirketin kaç kişi için, hangi eğitimi aldığını yönetmesi, bunu çalışanlara dağıtması ve çalışanların durumunu görmesi mümkün değil.

Başarı ölçütü: bir şirket tek bir hesapla bir eğitimin N kişilik kontenjanını alabiliyor, çalışanlarına atayabiliyor, kimin nerede olduğunu görebiliyor. Platform yöneticileri (biz) de aynı şeyi tüm şirketler ve tüm kullanıcılar için yapabiliyor.

## 2. Kavramlar

- **Kontenjan:** Bir şirketin bir eğitim (kurs) için sahip olduğu atanabilir hak sayısı. Arayüzde ve metinlerde "koltuk" ya da "lisans" değil, **kontenjan** denir.
- **Şirket:** Benzersiz kodu olan kurumsal kayıt.
- **Şirket admini:** Şirketi yöneten kullanıcı. Bir şirkette birden fazla olabilir.
- **Üye:** Şirkete bağlı ve onaylanmış bireysel hesap.
- **Ana admin:** Bizim platform yöneticilerimiz (mevcut `role = 'admin'`).

## 3. Hedefler, hedef olmayanlar, istenmeyen sonuçlar

**Hedefler**
- Kayıtta bireysel ya da kurumsal hesap seçimi, ikisinin amacını anlatan kısa yazıyla.
- Şirketin kontenjanı kendisi satın alabilmesi ya da bizim admin panelinden tanımlayabilmemiz.
- Şirket admininin kontenjanı üyelere atayıp geri alabilmesi.
- Şirket koduyla ve mail uzantısı eşleşmesiyle şirkete katılma, onay akışıyla.
- Şirket adminin kendi üyelerinin eğitim durumunu görmesi. Ana adminin tüm kullanıcıların durumunu ve sertifikalarını görmesi.

**Hedef olmayanlar (bu sürümde)**
- Uzmanlık Programı (`programs`) ve Profect Plus için kontenjan. Yalnızca tek kurs kontenjanı vardır. (Benim kararım.)
- Toplu alım indirimi. Fiyat birim fiyat × adettir. Mevcut kupon mantığı olduğu gibi çalışır. (Benim kararım.)
- Kontenjan süresi dolması. Kontenjan süresizdir. (Benim kararım.)
- Şirketler arası üyelik. Bir kullanıcı aynı anda tek şirkete bağlıdır. (Benim kararım.)

**İstenmeyen sonuçlar (teknik olarak çalışsa bile başarısızlık sayılır)**
- Bir şirket admini başka bir şirketin verisini görebiliyor ya da değiştirebiliyorsa.
- Bir çalışan şirket üyeyken kendi parasıyla kurs alabiliyorsa.
- İzlenmiş bir eğitimin kontenjanı uyarısız geri alınıp yeniden verilebiliyorsa.
- Şirket üyeliği ya da şirket admini yetkisi, şirket kodu bilen herkese onaysız açılıyorsa.

## 4. Kararlar (ürün sahibinden)

### 4.1 Hesap türleri ve kayıt
- Kayıtta iki seçenek vardır: **Bireysel** ve **Kurumsal**. Her ikisinde de kısa açıklama yazısı olur:
  - Bireysel: "Kendiniz için eğitim alın, kendi hızınızda ilerleyin, sertifikanızı alın."
  - Kurumsal: "Şirketiniz için toplu eğitim alın, çalışanlarınıza atayın, ilerlemelerini takip edin."
  (Bu iki cümle taslaktır, metni ürün sahibi değiştirebilir.)
- Çalışanlar için ayrı bir hesap türü yoktur. Bir şirketin çalışanı da **bireysel** hesap açar. Bir şirkete bağlıysa kayıtta şirket kodunu girer.
- Kurumsal kayıtta kayıt olan kişi şirketi de oluşturur ve şirketin ilk admini olur. Formda şirket adı, vergi dairesi, vergi no ve şirket mail uzantısı bulunur.
- Her şirketin sistem tarafından üretilen benzersiz bir kodu vardır. Şirket admini kodu panelinde görür.
- Bireysel kayıt formunda şirket kodu alanı isteğe bağlıdır. Girilen e-postanın uzantısı bir şirketinkiyle eşleşirse "X şirketine bağlı mısınız?" onay kutusu çıkar. İşaretlenirse şirket kodu alana otomatik yazılır.

### 4.2 Katılım onayı
- Şirket koduyla kayıt olan (ya da kodu sonradan giren) kullanıcı şirkete **onay bekliyor** durumuna girer.
- Onayı **ana admin ya da o şirketin adminlerinden herhangi biri** verebilir. Birinin onayı yeterlidir.
- Reddedilirse kullanıcı bireysel hesap olarak devam eder.
- Şirkette birden fazla admin olabilir. Şirket admini bir üyeyi admin yapabilir.

### 4.3 Kontenjanın kaynağı
- Şirket kendisi satın alabilir: eğitim seçip kaç kişilik alacağını yazar, mevcut sepet ve ödeme akışıyla öder. Ödeme onaylanınca o eğitimin kontenjanı artar.
- Özel anlaşma: ana admin admin panelinden bir şirkete bir eğitim için N kontenjan tanımlar. Ödeme sitede alınmaz.
- İki kaynak aynı havuzda birikir.

### 4.4 Atama ve geri alma
- Şirket admini kontenjandan bir üyeye eğitim atar. Üye için normal bir kurs kaydı açılır. İlerleme ve sertifika normal kullanıcıyla aynı çalışır.
- Şirket admini atanmış kontenjanı geri alıp başka birine verebilir.
- **İzlenmiş eğitim kuralı:** Geri alınan kullanıcı o kursta **en az bir video izlemişse**, admin uyarı görür: bu eğitimin hakkı yeni bir kişiye verilemez. Admin yine de onaylarsa kullanıcının erişimi kapanır, kontenjan havuza **dönmez** (yanar). İzlenmemişse uyarı çıkmaz, kontenjan havuza döner.
- Kural kurs bazında işler. Birden çok kurs atanmış kullanıcı için her kurs ayrı değerlendirilir.
- Geri alınan kullanıcının ilerlemesi ve aldığı sertifika silinmez. Sertifika doğrulama linki çalışmaya devam eder.

### 4.5 Çalışanın satın alması ve talep
- Şirkete bağlı (onaylı) üye **kendi parasıyla kurs alamaz**. Kendi parasıyla almak isteyen, ayrı bir bireysel hesap açar.
- Üye, şirket admininden bir kursu satın almasını **talep edebilir**. Kurs sayfasında "Satın al" yerine "Şirketimden talep et" görünür.
- Şirket admini talebi görür: boş kontenjan varsa kontenjan atar, yoksa satın alma akışına gider ya da reddeder.

### 4.6 Raporlama
- **Şirket admini:** Şirketinin üyelerinin, şirketin atadığı eğitimlerdeki durumunu görür: ders ilerlemesi, durum (başlamadı / devam ediyor / tamamlandı), sertifika kodu. Üyenin şirketten bağımsız aldığı kurslar görünmez (üye zaten kendi parasıyla kurs alamayacağı için bu ancak şirkete katılmadan önce alınmış kurslar için geçerlidir).
- **Ana admin:** Tüm kullanıcıların hangi eğitimde ne durumda olduğunu ve sertifikalarını görür. Bu, şirket bilgisiyle (şirket sütunu, şirkete göre filtre) zenginleşir.

### 4.7 Ekranlar
Onaylanan taslaklar (ürün sahibi tarayıcıda gördü, "bu haliyle devam" dedi):
1. **Kayıt ekranı:** Üstte Bireysel / Kurumsal kutuları (açıklamalarıyla). Bireysel formda isteğe bağlı şirket kodu ve mail uzantısı onay kutusu. Kurumsal formda şirket adı, vergi dairesi, vergi no, mail uzantısı.
2. **Şirket paneli, dört bölüm:**
   - *Kontenjanlar:* eğitim bazında Toplam / Atanan / Boş / Yanan, "Ata" ve "Daha fazla al" düğmeleri.
   - *Çalışanlar:* çalışan, eğitim, ders ilerlemesi, durum, sertifika kodu, "Kontenjanı geri al".
   - *Bekleyenler:* katılım istekleri (Onayla/Reddet) ve eğitim talepleri (Kontenjan ata / Satın al / Reddet).
   - *Geri alma uyarısı:* izlenmiş eğitimde çıkan kırmızı uyarı kutusu, "Vazgeç" ve "Yine de geri al".

Kontenjan metni her yerde "kontenjan" olarak yazılır (taslaklarda "koltuk" geçen yerler değişir).

## 5. Benim kararlarım (ürün sahibi gözden geçirsin)

1. **Kurumsal hesap onaysız açılır.** Ana admin onayı gerekmez, kayıtla şirket hemen oluşur. Alan adı kötüye kullanımına karşı: kayıt olan kişinin e-posta adresi, girdiği şirket mail uzantısıyla aynı olmalıdır (doğrulama koduyla zaten kanıtlanır). Bir uzantı tek şirkete aittir. Genel posta sağlayıcıları (gmail.com, outlook.com, hotmail.com, yahoo.com, icloud.com vb.) uzantı olarak kabul edilmez. Ana admin şirketi düzenleyip pasifleştirebilir.
2. **Mail uzantısı eşleşmesi yalnızca kolaylıktır.** Onay kutusu kodu doldurur ama katılım yine onay ister (4.2).
3. **Onay beklerken** kullanıcı normal bir bireysel hesap gibi davranır (satın alabilir). Şirkete **onaylandığı anda** kurs satın alma, Profect Plus alma ve hediye gönderme kapanır. Onaydan önce aldığı kurslar kalır. Hediyeyi **almak** serbesttir.
4. **Kullanıcı şirkete sonradan da katılabilir:** profil sayfasına "Şirkete katıl" alanı eklenir (mevcut kullanıcılar için yol olsun diye).
5. **Şirket admini kontenjanı kendine de atayabilir.**
6. **Zaten sahip olan kullanıcıya atama yapılamaz.** Kullanıcı o kursa başka yoldan sahipse (satın almış, hediye, Plus), atama reddedilir. Hediyedeki "zaten sahip" kuralının aynısı.
7. **Bir üye şirketten çıkarılırsa** (admin çıkarır), üyelik biter ve atanmış kontenjanları 4.4'teki geri alma kuralıyla işlenir (izlenmişse yanar, uyarı gösterilir). Çıkarılan kullanıcı bireysel hesap olarak devam eder. Son şirket admini çıkarılamaz ve adminlikten düşürülemez.
8. **Ana admin kontenjan düzenlemesi:** toplamı artırabilir. Azaltırken toplam, atanan + yanan sayıdan aşağı inemez.
9. **"İzlenmiş" tanımı:** o kursun herhangi bir dersi için kullanıcıda `lesson_progress` satırı ya da `video_stream_usage` satırı (bytes > 0) varsa izlenmiş sayılır. Sayfa yüklenip hemen kapanan istekler yüzünden yanlış "izlenmiş" çıkmasın diye eşik (örnek: toplam akış baytı belirli bir eşiğin üstü) uygulayıp uygulamamak oluşturucunun kararıdır (6. bölüm).
10. **Talepler** kurs bazındadır. Aynı üyenin aynı kurs için birden fazla açık talebi olamaz. Durumlar: bekliyor / karşılandı / reddedildi. Üye kendi taleplerinin durumunu görür.
12. **Şirket admini de üyedir.** Kurumsal kayıtla gelen ilk admin dahil, şirket adminleri de 4.5'teki "kendi parasıyla kurs alamaz" kısıtına tabidir. Kendileri için eğitim isterlerse şirketin kontenjanından kendilerine atarlar (madde 5). Kontenjan alımı dışında bireysel satın alma yapamazlar.
11. **Şirket satın alması** normal sipariştir: fatura bilgileri ("kurumsal" fatura tipi) şirket kaydından önceden doldurulur. Ödeme onaylanınca `fulfillOrder` kurs kaydı **açmaz**, şirketin kontenjanını artırır. Şirket kontenjan alımı yalnızca şirket adminlerine açıktır.

## 6. Oluşturucuya bırakılanlar

- Veri modeli: tablolar, sütunlar, indeksler. (Mevcut sistem MySQL, `db/migrations/NNN_*.sql` numaralı idempotent dosyalar kullanıyor; sıradaki numara 020.) Kabaca gereken kavramlar: şirket, şirket mail uzantıları, şirket üyeliği (durum + rol), kontenjan kaynakları (satın alma / admin, sipariş bağlantısı), atamalar (aktif / geri alınmış / yanmış), talepler.
- `enrollments.source` değerine şirket ataması için yeni bir değer (ör. `company`) eklenmesi ve mevcut `canAccessCourse` / `listMyCourses` yollarının buna uyumu.
- Sepete adet (kişi sayısı) kavramının nasıl ekleneceği. Mevcut sepet öğesi adet taşımıyor (`src/lib/cart.ts`, `src/lib/cart-quote.ts`).
- Şirket kodu biçimi (öneri: okunabilir ön ek + 4-6 karakterlik karışması zor alfabe) ve kod tahmin etme saldırısına karşı oran sınırı.
- Şirket admini yetkilendirmesi: JWT'deki `role` değişmez. Şirket yetkisi DB'den (üyelik tablosundan) okunmalı ve her şirket API'sinde hem sunucu hem sayfa tarafında doğrulanmalı. Mevcut `requireAdminPage` / `requireUser` kalıbı örnek alınabilir.
- Yeni sayfa yolları (öneri: şirket paneli `/sirket`, ana admin tarafı `/admin/sirketler`) ve `src/proxy.ts` matcher'ına eklenmesi.
- Ana admin ekranları: şirket listesi/detayı, kontenjan tanımlama, katılım onayları; `/admin/kullanicilar` ve `/admin/kayitlar` sayfalarına şirket sütunu ve filtresi.
- E-posta bildirimleri (katılım onaylandı/reddedildi, talep sonucu, yeni katılım isteği) gerekiyorsa kapsamı.
- Eşzamanlılık: iki admin aynı anda son kontenjanı atarsa tek biri başarılı olmalı (hediye talep akışındaki `FOR UPDATE` kalıbı örnek).
- Test stratejisi: saf kurallar (`*-rules.ts` + `node --test`) ve mevcut `scripts/test-*.mjs` kalıbı.

## 7. Kısıtlar

- `AGENTS.md`: kullanılan Next.js sürümü bilinen sürümden farklıdır. Kod yazmadan önce `node_modules/next/dist/docs/` altındaki ilgili rehber okunmalı.
- Kart verisi saklanmaz. Fatura ve ödeme akışı mevcut sağlayıcı soyutlamasından (`src/lib/payment`) geçer. Fiyat daima sunucuda DB'den hesaplanır, istemciden tutar alınmaz.
- Mevcut kullanıcı, sipariş ve kayıt verisi bozulmamalı. Migrasyon geriye dönük uyumlu ve yeniden çalıştırılabilir olmalı.

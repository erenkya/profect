# Sınav modları: sabit sınav ve soru havuzu

Tarih: 2026-10-30

## Amaç

Bugün her sınavın soruları sabit bir listedir; her yeni oturumda yalnızca sıra ve şıklar karışır, **hangi soruların geleceği hep aynıdır**. Eğitmen şunu isteyebilmeli: 30 soruluk bir havuz yükleyip sınavda 20 tanesinin gösterilmesi; böylece iki öğrencinin sınavı soru ve sıra olarak birebir aynı olmasın. Bazı kritik sorular her sınavda mutlaka çıksın, isterse hangi soru tipinden kaçar tane çıkacağı da belirlenebilsin.

Bu, [soru tipleri tasarımında](2026-10-19-quiz-question-types-design.md) kapsam dışı bırakılan "soru bankası, sorular arası rastgele seçim" işidir.

## Hedefler

- Her sınav iki moddan birinde çalışır:
  1. **Sabit sınav:** Eğitmenin yazdığı sıra; her öğrenci aynı soruları aynı sırayla görür.
  2. **Soru havuzu:** Eğitmen havuza istediği kadar soru yükler; sınavda gösterilecek soru sayısını belirler. Her öğrenciye (her yeni oturumda) havuzdan farklı bir set çıkar, sıra da karışıktır.
- Havuz modunda isteğe bağlı iki kontrol:
  - **Kesin sorular:** İşaretli sorular her öğrencinin sınavında mutlaka yer alır.
  - **Tipe göre dağılım:** Örneğin "5 tek cevaplı, 10 çok cevaplı, 5 sürükle-bırak".
- Sorular bugünkü yollarla yüklenir: sınav editörü ve CSV içe aktarma (CSV'ye "kesin" sütunu eklenir).
- Puanlama, süre, sonuç ve "Cevaplarımı gör" ekranları yalnızca öğrencinin gördüğü sorular üzerinden çalışır.

## Hedef dışı

- Soru ağırlığı, zorluk seviyesi, konu etiketi ve bunlara göre çekim.
- Birden fazla havuz ya da kurslar arası ortak soru bankası.
- Aynı öğrenciye tekrar denemede önceki setten farklı bir set *garantisi* (her yeni oturum bağımsız çekilir).
- Senaryo alt sorularına özel kota ya da ayrı bir "senaryo" kategorisi (aşağıya bakın).

## Kaçınılacaklar

- Doğru cevabın öğrenciye sızması (bugünkü kural aynen korunur).
- Sayfa yenileyerek "kolay set" çekmek: açık oturum varken yenileme aynı seti döndürmeli.
- Çekilmemiş sorular yüzünden öğrencinin puanının düşmesi: skor yalnızca çekilen sorulara göre hesaplanır.
- Eğitmenin imkânsız bir ayarı kaydedebilmesi (ör. havuzdan fazla soru istemek). Tutarsızlık kayıtta engellenir.

## Kararlar (kullanıcının kararları)

- İki mod: sabit sınav ve soru havuzu. Havuzdan kaç soru çekileceğini eğitmen seçer.
- Kesin sorular işaretlenebilir; her sınavda yer alır.
- Tipe göre dağılım isteğe bağlıdır. Tipler mevcut tiplerdir: tek cevaplı, çok cevaplı, sürükle-bırak.
- **Senaryo alt soruları sıradan sorular gibi davranır:** havuzda bağımsız çekilir, kendi tipinin (tek/çok cevaplı) kotasına sayılır, ayrı bir kategori ya da özel ayar yoktur. Sınav ekranı her alt sorunun üstünde senaryo kartını zaten gösterdiği için senaryonun tüm alt soruları gelmek zorunda değildir.

## Tasarım (benim kararlarım; itiraz edilebilir)

### Çekim kuralları

Çekim öğrenci için **yeni bir oturum açılırken** sunucuda yapılır. Girdi: sınavın puanlanan soruları (senaryolar alt sorularına açılır; senaryonun kendisi çekilmez), her sorunun tipi ve "kesin" bayrağı, sınavın ayarları. N = sınavda gösterilecek soru sayısı.

1. Kesin sorular seçilir.
2. Tip dağılımı girilmişse: kotası olan her tip için, kota kadar soru o tipten seçilir (kesin sorular o tipin kotasına sayılır, kalan yer o tipin kesin olmayan sorularından rastgele dolar). Kotası olmayan tiplerde yalnızca kesin sorular alınır.
3. Seçilenlerin sayısı N'den azsa kalan yerler **tipten bağımsız** olarak, henüz seçilmemiş sorulardan rastgele dolar. Yani kotaların toplamı N'den küçükse kotalar "en az" anlamına gelir; toplam N'ye eşitse tam o dağılım çıkar. Dağılım hiç girilmemişse 1. adımdan sonra tamamı rastgele dolar.
4. Seçilen sorular bugünkü kuralla sıralanır: üst düzey öğeler (tek soru, ya da çekilen alt sorularıyla senaryo) karıştırılır; aynı senaryodan çekilen alt sorular yan yana, editör sırasında kalır; şıklar/kartlar karıştırılır.

Çekim saf bir modülde (`quiz-pool.ts`, rastgelelik dışarıdan verilir; `orderForStudent` gibi) yazılır ki `node --test` ile test edilebilsin.

### Veri modeli (migration 012)

- `quizzes.mode` — `ENUM('fixed','pool') NOT NULL DEFAULT 'fixed'`.
- `quizzes.draw_count` — `INT UNSIGNED NULL`. Havuz modunda gösterilecek soru sayısı; **NULL = havuzun tamamı (karışık)**.
- `quizzes.draw_by_type` — `JSON NULL`. Örn. `{"single":5,"multiple":10,"categorize":5}`; olmayan anahtar = o tipe kota yok.
- `questions.is_required` — `TINYINT(1) NOT NULL DEFAULT 0`. Sabit modda yok sayılır.

**Mevcut sınavların davranışı korunur:** migration mevcut tüm sınavları `mode='pool'`, `draw_count=NULL` yapar (bugün de tüm sorular her oturumda karışık gelir). Yeni oluşturulan sınav varsayılan olarak `fixed` olur. *(Benim kararım: canlı sınavların davranışı sessizce değişmesin diye.)*

### Sunucu akışı

- **Sabit mod:** soru sırası editör sırasıdır (karıştırma yok); şıklar/kartlar bugünkü gibi karışır *(benim kararım)*. Oturum mantığı (devam etme, taslak cevaplar) aynen çalışır.
- **Havuz modu:** oturum **zorunludur**, süresiz sınavlarda da. Yeni oturum açılırken çekim yapılır ve `quiz_sessions.question_order` yalnızca çekilen soruları (ve şık/kart sırasını) saklar. Açık oturumda aynı set döner.
  - `applySavedOrder` bugün kayıtlı sıranın *tüm* sınav sorularını kapsamasını bekliyor; havuz için kayıtlı id'lerin soru kümesinin **alt kümesi** olmasını kabul edecek biçimde genişletilir. Kayıtlı bir soru/şık artık yoksa (sınav o arada düzenlendiyse; editör kaydı soruları silip yeniden yazdığı için id'ler değişir) bugünkü gibi yeniden çekilir ve taslak cevaplar temizlenir.
- **Gönderim (`submit`):** bugün `loadQuiz` ile *tüm* sınav sorularını puanlıyor ve `totalQuestions = grading.size` dönüyor. Havuz modunda yalnızca oturumdaki (çekilen) sorular puanlanır; `totalQuestions` çekilen sayıdır; oturum yoksa 409 döner. Çekilmemiş sorulara gelen cevaplar yok sayılır. Skor = toplam puan / çekilen soru sayısı × 100.
  - **Bayat oturum:** Oturumda saklı soru ya da şık/kart id'lerinden biri artık sınavda yoksa (eğitmen öğrenci sınavdayken kaydettiyse, ki ayar değişikliği de soruları yeniden yazar), `submit` aynı doğrulamayı yapar ve **409 döner** ("Sınav güncellendi; sınavı yeniden başlatın."). Kısmi puanlama ya da havuzun tamamını puanlamaya geri düşme yapılmaz; öğrenci yeniden başlatınca `GET` yeni set çeker. *(Benim kararım; `GET`'teki bugünkü "eski sıra geçersizse yeniden başla" davranışıyla tutarlı.)*
- **Oturum ömrü:** Bugünkü davranış korunur. Süresiz sınavda açık oturum gönderilene kadar aynı seti verir; süreli sınavda süre dolunca oturum geçersiz sayılır ve yeni çekim yapılır. Gönderimden sonra "Tekrar dene" yeni bir çekim yapar. Ek süre sınırı ya da "baştan başla" düğmesi yoktur. *(Benim kararım.)*
- **Soru sayısı gösterimleri:** `lms.ts`'teki `question_count` sorguları, kurs sayfası ("X soru"), sınav giriş ekranı ve admin kurs ekranı havuz modunda `draw_count`'u (NULL ise havuz boyutunu) göstermeli. Admin ekranında "havuz: M · sınavda: N" gösterilir. "Sınavda soru var mı" kontrolleri aynı kalır.

### Kayıtta doğrulama

Sunucuda `quizSchema` içinde (editör ön kontrolü aynı saf fonksiyonu kullanır). Havuz modu, N = `draw_count` (NULL ise havuz boyutu), `K` = tip kotaları, `req(t)` = o tipteki kesin soru sayısı, `pool(t)` = o tipteki toplam soru sayısı:

- N ≤ havuzdaki toplam puanlanan soru sayısı.
- Toplam kesin soru sayısı ≤ N.
- Kotası girilmiş her tip için: `req(t) ≤ kota(t) ≤ pool(t)`.
- Σ (kotası olan tipte `kota(t)`, olmayan tipte `req(t)`) ≤ N.
- Kotalar ve `draw_count` pozitif tam sayı (kotası boş bırakılan tip "kota yok").

Her ihlal, eğitmenin anlayacağı Türkçe bir mesajla döner (ör. "Kesin işaretli 4 soru var ama tek cevaplı kotası 3.").

### Yönetici editörü

- Sınav ayarlarında **Sınav türü** seçimi: Sabit sınav / Soru havuzu.
- Havuz seçiliyken: "Sınavda gösterilecek soru sayısı" (boş = hepsi), "Tipe göre dağılım" bölümü (her tip için sayı kutusu, yanında havuzdaki toplam, altta "kalan N rastgele" göstergesi).
- Havuz modunda her soru kartında **"Kesin çıksın"** işareti. Senaryolarda işaret her alt sorunun kendisindedir *(benim kararım)*, senaryonun kendisinde yoktur.
- CSV: isteğe bağlı **`kesin`** sütunu (evet/1/x = kesin). Sütun yoksa tüm sorular kesin değildir; böylece eski CSV dosyaları çalışmaya devam eder. Şablon ve açıklama satırları güncellenir. CSV'nin kendisi mod ya da sayı taşımaz; onlar editörde ayarlanır.

## Uygulayana bırakılanlar

- Editör ve ayar bölümünün görsel ayrıntıları, mevcut admin dilinde.
- Hata mesajlarının tam metni.
- `QuizReview` ve sonuç ekranının çekilen alt kümeyle doğru çalıştığının kontrolü (cevaplar zaten soru id'siyle saklanıyor).
- Testler: çekim (kesin, kota, kalan doldurma, yeterli soru yok), doğrulama, `applySavedOrder` alt küme, CSV `kesin` sütunu. Mevcut testler `src/lib/*.test.ts` altındaki saf modüllerde.

## Kısıtlar

- Sunucu uçları Next.js'in bu sürümündeki kurallara uymalı: koda başlamadan önce `node_modules/next/dist/docs/` altındaki ilgili kılavuz okunur (AGENTS.md).
- Mevcut sınavlar, denemeler ve sertifikalar bozulmaz.

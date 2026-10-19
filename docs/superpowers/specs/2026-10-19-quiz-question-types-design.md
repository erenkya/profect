# Sınav soru tipleri: çok cevaplı, sürükle-bırak, senaryolu

Tarih: 2026-10-19

## Amaç

Sınavlar bugün yalnızca tek doğru şıklı sorulardan oluşuyor. Ölçülen bilgiyi çeşitlendirmek için üç yeni tip eklenir:

1. **Çok cevaplı soru**: birden fazla doğru şık.
2. **Sürükle-bırak (kategorilere ayırma)**: kartları doğru kategorilere bırakma.
3. **Senaryolu soru**: bir senaryo metni ve onun üzerinden sorulan alt sorular.

İlk deneme, sistemdeki mock kurs üzerinde yapılacak.

## Hedefler

- Yönetici, sınav editöründe dört tipi (tek cevaplı, çok cevaplı, sürükle-bırak, senaryo) oluşturabilir, düzenleyebilir.
- Öğrenci sınavı bugünkü gibi **soruları tek tek** çözer; yeni tipler bu akışa uyar.
- Puanlama, sonuç ekranı, "Cevaplarımı gör" incelemesi ve açıklama alanı yeni tiplerle de çalışır.
- Mevcut sorular ve denemeler bozulmaz (mevcut sorular "tek cevaplı" olarak kalır).

## Hedef dışı

- Başka soru tipleri (boşluk doldurma, eşleştirme, açık uçlu vb.).
- Soru bankası, sorular arası rastgele seçim.
- Soru başına farklı ağırlık (her puanlanan soru 1 birim).

## Kaçınılacaklar

- Doğru cevabın öğrenciye sızması. Bugünkü kural korunur: doğru şık / kartın doğru kategorisi istemciye hiçbir yerde gönderilmez. Öğrenci yalnızca kendi cevabının doğru/yanlış olduğunu ve (varsa) yönetici açıklamasını görür.
- Mobilde sürükle-bırakın çalışmaması.

## Kararlaştırılanlar (kullanıcının kararları)

### Puanlama

- Her puanlanan soru **1 birim**. Skor = toplam puan / puanlanan soru sayısı × 100 (yuvarlanır), geçme notu bugünkü gibi.
- **Tek cevaplı**: doğru şık seçildiyse 1, değilse 0.
- **Çok cevaplı**: seçilen şık kümesi doğru şık kümesiyle **birebir aynıysa 1**, değilse 0. Kısmi puan yok.
- **Sürükle-bırak**: **kart başına kısmi puan**. Puan = doğru kategoriye konan kart sayısı / toplam kart sayısı (ör. 8 karttan 6'sı doğruysa 0,75).
- **Senaryolu**: senaryonun kendisi puanlanmaz; **her alt soru ayrı bir soru gibi puanlanır** (3 alt sorulu senaryo sınava 3 soru ekler). Alt sorular tek cevaplı ya da çok cevaplı olabilir; kuralları yukarıdaki gibidir.

### Çok cevaplı soru

- Şık sayısı ve doğru şık sayısı soruya göre değişir (en az 2 şık, en az 1 doğru).
- Öğrenci **kaç doğru şık olduğu konusunda bilgilendirilir** (ör. "3 doğru cevabı seç").

### Sürükle-bırak

- Bir kategoriye birden fazla kart düşebilir.
- **Her kategoriye ait en az bir kart** olmalıdır (editörde doğrulanır).
- Her kartın tam olarak bir doğru kategorisi vardır.

### Senaryolu soru

- Senaryo metni (zorunlu), isteğe bağlı bir **senaryo sorusu** ve sayısı sabit olmayan alt sorular (en az 1).

## Tasarım (benim kararlarım — itiraz edilebilir)

### Veri modeli (migration 008)

`questions` tablosu genişletilir; senaryo da bir `questions` satırıdır, alt sorular ona `parent_id` ile bağlanır. Böylece silme (CASCADE) ve mevcut "soruları sil-yeniden yaz" kaydetme akışı aynen çalışır.

- `questions.type` — `ENUM('single','multiple','categorize','scenario') NOT NULL DEFAULT 'single'` (mevcut satırlar `single` olur).
- `questions.parent_id` — `INT UNSIGNED NULL`, `questions(id)`'ye FK, `ON DELETE CASCADE`. Yalnızca senaryo alt sorularında dolu.
- `questions.scenario_prompt` — `TEXT NULL`. Senaryonun isteğe bağlı sorusu; `question_text` senaryo metnidir.
- `questions.position` — `INT NOT NULL DEFAULT 0`. Editördeki sıra (alt sorular senaryo içinde sıralanır).
- Yeni tablo `question_categories (id, question_id → questions CASCADE, name, position)`.
- `options.category_id` — `INT UNSIGNED NULL`, `question_categories(id)`'ye FK. Sürükle-bırakta kartlar `options` satırıdır; `category_id` kartın doğru kategorisidir, `is_correct` kullanılmaz.

"Puanlanan soru" = `type <> 'scenario'`. Soru sayısını gösteren tüm sorgular (`lms.ts` içindeki `question_count` ve "sınavda soru var mı" kontrolleri, sınav başlangıç ekranı) buna göre güncellenir.

### Cevap biçimi

İstemci → sunucu ve `quiz_attempts.answers` aynı biçimi kullanır (anahtar: puanlanan sorunun id'si):

- tek cevaplı: `optionId`
- çok cevaplı: `[optionId, ...]`
- sürükle-bırak: `{ "<kartId>": kategoriId, ... }`

Eski denemelerdeki sayı biçimi tek cevaplı olarak okunmaya devam eder.

### Sunucu sonucu

Gönderim yanıtında her puanlanan soru için: `points` (0–1), `isCorrect` (= `points === 1`), öğrencinin cevabı ve tam doğru değilse `explanation`. Sürükle-bırakta ek olarak **kart başına doğru/yanlış** bilgisi döner; doğru kategori dönmez. Sonuç kartında skorla birlikte "X / N tam doğru" gösterilir.

### Sınav akışı (öğrenci)

- Her **puanlanan soru bir adım**dır; numaralı kutucuklar bu adımları gösterir.
- Senaryo alt sorusunun adımında, sorunun üstünde **senaryo metni ve senaryo sorusu** bir kart olarak gösterilir (aynı senaryonun her alt sorusunda tekrar görünür; uzun metinler için daraltılabilir). Senaryonun alt soruları sınavda birbirini izler.
- Karıştırma: üst düzey öğeler (sorular ve senaryolar) bugünkü gibi karıştırılır; senaryo alt soruları kendi sırasında kalır. Şıklar ve kartlar karıştırılır; kategoriler sabit sırada.
- **Çok cevaplı**: onay kutuları, "N doğru cevabı seç" bilgisi. En fazla N şık seçilebilir; tam N seçildiğinde soru "cevaplandı" sayılır. Otomatik sonraki soruya geçiş yalnızca tek cevaplıda olur.
- **Sürükle-bırak**: üstte yerleştirilmemiş kartlar, altta kategori kutuları. Fareyle ve dokunarak sürükleme, ayrıca **kartı seç → kategoriye dokun** ile yerleştirme (klavye ve mobil için). Yerleştirilen kart geri alınabilir/taşınabilir. Tüm kartlar yerleştirildiğinde soru "cevaplandı" sayılır.
- "Sınavı Bitir" bugünkü gibi tüm sorular cevaplanınca etkin olur; süre dolunca eksik cevaplarla otomatik gönderim sürer (eksik kısımlar yanlış sayılır).

### İnceleme (sonuç ekranı ve "Cevaplarımı gör")

- Tek/çok cevaplı: öğrencinin seçtiği şıklar doğru/yanlış olarak işaretlenir (çok cevaplıda seçilen her şık için doğru/yanlış gösterilir; seçilmeyen doğru şıklar gösterilmez).
- Sürükle-bırak: her kategori altında öğrencinin koyduğu kartlar, her kart doğru/yanlış işaretli; soru puanı (ör. "%75") gösterilir.
- Senaryo alt soruları, senaryo metniyle gruplanarak listelenir.
- Açıklama, sorunun puanı 1'in altındaysa gösterilir.

### Yönetici editörü

- Her soru kartında tip seçimi: Tek cevaplı / Çok cevaplı / Sürükle-bırak. Ayrıca "+ Senaryo ekle".
- Çok cevaplı: şıkların yanında onay kutusu (birden çok doğru), şık ekle/sil.
- Sürükle-bırak: kategori listesi (ekle/sil/yeniden adlandır, en az 2) ve kart listesi (her kartın yanında kategori seçimi).
- Senaryo: senaryo metni, isteğe bağlı senaryo sorusu, içinde alt soru ekle (tek/çok cevaplı).
- Doğrulama (sunucuda zod, editörde ön kontrol): tek cevaplı tam 1 doğru; çok cevaplı ≥1 doğru; sürükle-bırak ≥2 kategori, her kategoride ≥1 kart, her kartın kategorisi var; senaryo ≥1 alt soru.

### Sürükle-bırak kütüphanesi

`@dnd-kit/core` eklenir: fare, dokunma ve klavye desteğini birlikte verir; tarayıcının yerleşik sürükle-bırakı dokunmatik ekranlarda çalışmaz.

## Uygulayana bırakılanlar

- Editörde soruların sırasını değiştirme (yukarı/aşağı) — mevcut editörde yok; gerekirse basit ok butonları.
- Görsel ayrıntılar ve animasyonlar, mevcut sınav ekranı diliyle.
- Mock kursa her tipten örnek soru eklemek (deneme için).

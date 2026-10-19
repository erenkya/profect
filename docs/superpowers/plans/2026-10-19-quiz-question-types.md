# Sınav Soru Tipleri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sınavlara çok cevaplı, sürükle-bırak (kategorilere ayırma) ve senaryolu soru tiplerini; yönetici editörü, öğrenci akışı, puanlama ve inceleme dahil eklemek.

**Architecture:** Puanlama ve soru yapısı mantığı saf (DB'siz) iki modülde toplanır (`quiz-model.ts`, `quiz-grading.ts`) ve `node:test` ile test edilir. DB okuma/yazma `quiz-data.ts` (server-only) ve mevcut `quiz-admin.ts`'te toplanır; API rotaları, sınav sayfası ve yönetici sayfası yalnızca bu modülleri çağırır. Senaryolar `questions` tablosunda `type='scenario'` satırı, alt soruları `parent_id` ile bağlı satırlardır.

**Tech Stack:** Next.js 16 App Router, React 19, mysql2 (MariaDB), zod 3, `node --test` (strip-types), yeni bağımlılık `@dnd-kit/core`.

**Spec:** `docs/superpowers/specs/2026-10-19-quiz-question-types-design.md`

## Global Constraints

- Her puanlanan soru 1 birim; skor = `Math.round(toplamPuan / puanlananSoruSayısı * 100)`.
- single: doğru şık → 1, değilse 0. multiple: seçilen küme == doğru küme → 1, değilse 0. categorize: doğru yerleştirilen kart / toplam kart (kısmi). scenario: puanlanmaz, alt soruları (single/multiple) ayrı puanlanır.
- Doğru şık / kartın doğru kategorisi istemciye **hiçbir yanıtta** gönderilmez (öğrenci API'si, gönderim yanıtı, inceleme verisi). multiple için yalnızca doğru şık **sayısı** gönderilir.
- Açıklama yalnızca `points < 1` olan soruda gönderilir.
- Kategorize: ≥2 kategori, her kategoride ≥1 kart, her kartın tam bir kategorisi. Çok cevaplı: ≥2 şık, ≥1 doğru. Tek cevaplı: tam 1 doğru. Senaryo: ≥1 alt soru (single/multiple).
- `kind` belirtilmeyen soru girdisi `single` kabul edilir (mevcut istemciler ve `scripts/test-api.mjs` kırılmaz).
- Eski `quiz_attempts.answers` değerleri (`{ soruId: sayı | null }`) okunmaya devam eder.
- Tüm kullanıcıya görünen metinler Türkçe; mevcut sınav ekranının görsel dili (`blueprint`, `card`, `--ease`, `prefers-reduced-motion`) korunur.
- Testler: `npm test` (`src/lib/*.test.ts`), tip kontrolü: `npm run typecheck`.

## Review Focus

- Süre dolunca yarım cevaplarla otomatik gönderim (multiple'da eksik seçim, categorize'da yerleşmemiş kartlar) → hata vermeden puanlanmalı; eksikler yanlış sayılır. → Task 2 testi `gradeQuestion: yarım categorize cevabı kısmi puan alır`, `gradeQuestion: multiple eksik seçim 0`.
- Kurcalanmış gönderim (başka sorunun şık id'si, tekrarlanan id, sayı yerine dizi, var olmayan kategori) → çökmeden 0/yanlış. → Task 2 testi `gradeQuestion: geçersiz cevap biçimleri 0 puan`.
- Senaryo alt soruları karıştırmada dağılmamalı ve senaryonun kendisi soru sayısına girmemeli. → Task 1 testi `orderForStudent: senaryo alt soruları bitişik ve sıralı kalır`; Task 4'te `question_count` sorguları.
- Yönetici kaydedince sorular yeniden oluşturulur; eski denemenin incelemesi yeni sorularla karışmamalı. → Task 5: inceleme yalnızca `answers` anahtarlarında bulunan soruları gösterir (mevcut davranış korunur).
- Eski tek cevaplı sınavlar ve eski denemeler aynen çalışmalı. → Task 3 testi `quizSchema: kind'sız eski girdi single olarak kabul edilir`; Task 2 testi `parseStoredAnswers: eski sayı biçimi`.

---

### Task 1: Ortak model — tipler, cevap durumu, öğrenci sırası

**Files:**
- Create: `src/lib/quiz-model.ts`
- Test: `src/lib/quiz-model.test.ts`

**Interfaces:**
- Produces (hepsi `quiz-model.ts`, saf, istemci ve sunucuda kullanılabilir):
  - `type QuestionKind = "single" | "multiple" | "categorize"`
  - `type ScenarioRef = { id: number; text: string; prompt: string | null }`
  - `type PublicQuestion = { id: number; text: string; scenario: ScenarioRef | null } & ({ kind: "single"; options: { id: number; text: string }[] } | { kind: "multiple"; options: { id: number; text: string }[]; correctCount: number } | { kind: "categorize"; cards: { id: number; text: string }[]; categories: { id: number; name: string }[] })`
  - `type Answer = number | number[] | Record<string, number>` (single | multiple | categorize: `{ kartId: kategoriId }`)
  - `type GradeResult = { points: number; isCorrect: boolean; answer: Answer | null; cardResults?: Record<string, boolean>; explanation?: string }`
  - `type QuizItem = { kind: "question"; question: PublicQuestion } | { kind: "scenario"; scenario: ScenarioRef; questions: PublicQuestion[] }`
  - `isAnswered(q: PublicQuestion, a: Answer | undefined): boolean`
  - `orderForStudent(items: QuizItem[], shuffle: <T>(a: T[]) => T[]): PublicQuestion[]`

- [ ] **Step 1: Testleri yaz** (`quiz-model.test.ts`, mevcut test dosyalarının `node:test` + `assert/strict` stiliyle)
  - `isAnswered: single sayı varsa true, undefined false`
  - `isAnswered: multiple yalnızca seçim sayısı correctCount'a eşitse true` — correctCount 2: `[5]` → false, `[5,6]` → true
  - `isAnswered: categorize tüm kartlar yerleşince true` — kartlar 1,2: `{"1":10}` → false, `{"1":10,"2":11}` → true
  - `orderForStudent: senaryo alt soruları bitişik ve sıralı kalır` — items `[q1, scenario(s, [a,b,c]), q2]`, ters çeviren `shuffle` ile sonuç `[q2, a, b, c, q1]`; a/b/c'nin `scenario` alanı `s`
  - `orderForStudent: alt sorusuz senaryo atlanır`
- [ ] **Step 2: Çalıştır, başarısız olmalı** — `npm test` → `quiz-model.ts` bulunamadı hatası
- [ ] **Step 3: `quiz-model.ts`'i yaz.** `orderForStudent` yalnızca üst düzey `items` dizisini `shuffle`'a verir, senaryoyu yerinde alt sorularına açar (alt sorular kendi sırasında). Şık/kart karıştırma bu fonksiyonun işi değil (Task 4).
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: Commit** — `feat(quiz): ortak soru modeli ve öğrenci sıralaması`

### Task 2: Puanlama

**Files:**
- Create: `src/lib/quiz-grading.ts`
- Test: `src/lib/quiz-grading.test.ts`

**Interfaces:**
- Consumes: Task 1 tipleri.
- Produces:
  - `type GradingQuestion = { id: number; explanation: string | null } & ({ kind: "single" | "multiple"; optionIds: number[]; correctOptionIds: number[] } | { kind: "categorize"; categoryIds: number[]; cardCategory: Record<string, number> })`
  - `gradeQuestion(q: GradingQuestion, raw: unknown): GradeResult` — `answer` alanı normalize edilmiş cevaptır (geçersiz kısımlar atılır; hiç geçerli bir şey yoksa `null`).
  - `scoreAttempt(results: GradeResult[]): { score: number; points: number; correctCount: number }`
  - `parseStoredAnswers(raw: unknown): Record<string, unknown>` — DB'den gelen `answers` (MariaDB'de metin, MySQL'de nesne) → nesne; bozuksa `{}`.

- [ ] **Step 1: Testleri yaz**
  - `gradeQuestion: single doğru 1, yanlış 0, null 0`
  - `gradeQuestion: multiple küme eşitse 1, sıra önemsiz` — doğru `[2,3]`, cevap `[3,2]` → 1
  - `gradeQuestion: multiple eksik seçim 0` — `[2]` → 0; `gradeQuestion: multiple fazla seçim 0` — `[2,3,4]` → 0
  - `gradeQuestion: categorize kart başına kısmi puan` — 4 karttan 3'ü doğru → `points 0.75`, `isCorrect false`, `cardResults` 4 anahtar (3 true 1 false)
  - `gradeQuestion: yarım categorize cevabı kısmi puan alır` — 4 karttan 2'si yerleşmiş ve doğru → 0.5; yerleşmemiş kart `cardResults`'ta false
  - `gradeQuestion: geçersiz cevap biçimleri 0 puan` — single'a başka sorunun şık id'si / `[2]` / `"2"`; multiple'a `[2,2,3]` (tekrar → küme `{2,3}` sayılır, doğruysa 1 — bunu da assert et), `5`; categorize'a dizi, var olmayan kategori id'si → ilgili kart false; hiçbiri throw etmez
  - `gradeQuestion: açıklama yalnızca points < 1 iken döner`
  - `gradeQuestion: cardResults doğru kategoriyi sızdırmaz` — `JSON.stringify(result)` içinde, öğrencinin seçmediği doğru kategori id'si geçmez (sadece boolean'lar)
  - `scoreAttempt: kısmi puanlar toplanır, score yuvarlanır, correctCount yalnız tam doğrular` — points `[1, 0.75, 0]` → `points 1.75`, `score 58`, `correctCount 1`
  - `parseStoredAnswers: eski sayı biçimi, JSON metni ve bozuk metin`
- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: `quiz-grading.ts`'i yaz** (saf; `quiz-model.ts` dışında import yok)
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: Commit** — `feat(quiz): soru tiplerine göre puanlama`

### Task 3: Migration ve yönetici şeması

**Files:**
- Create: `db/migrations/008_question_types.sql`
- Modify: `src/lib/admin-schemas.ts` (`quizSchema.questions`)
- Test: `src/lib/admin-schemas.test.ts`

**Interfaces:**
- Produces: `QuizInput["questions"][number]` = union, `kind` ile ayrılır:
  - `{ kind: "single" | "multiple"; question_text; explanation?; options: { option_text; is_correct }[] }`
  - `{ kind: "categorize"; question_text; explanation?; categories: string[]; cards: { card_text: string; category_index: number }[] }`
  - `{ kind: "scenario"; scenario_text: string; scenario_prompt?: string; questions: (single|multiple)[] }`

- [ ] **Step 1: Migration'ı yaz** — spec'teki "Veri modeli" bölümü: `questions.type ENUM('single','multiple','categorize','scenario') NOT NULL DEFAULT 'single'`, `parent_id INT UNSIGNED NULL` (FK `questions(id)` CASCADE), `scenario_prompt TEXT NULL`, `position INT NOT NULL DEFAULT 0` + `UPDATE questions SET position = id`; `question_categories (id, question_id FK CASCADE, name VARCHAR(500) NOT NULL, position INT NOT NULL DEFAULT 0)` (`utf8mb4_unicode_ci`, diğer tablolarla aynı başlık); `options.category_id INT UNSIGNED NULL` (FK `question_categories(id)` CASCADE). Migration'ı **çalıştırma** — kullanıcı onayıyla Task 8'de.
- [ ] **Step 2: Şema testlerini yaz** (`admin-schemas.test.ts`'e ekle)
  - `quizSchema: kind'sız eski girdi single olarak kabul edilir` — parse sonucu `kind === "single"`
  - `quizSchema: single'da 2 doğru reddedilir; multiple'da 2 doğru kabul, 0 doğru reddedilir`
  - `quizSchema: categorize — boş kategori reddedilir` (3 kategori, kartlar yalnız 0 ve 1'de) `; aralık dışı category_index reddedilir; 1 kategori reddedilir`
  - `quizSchema: scenario — alt sorusuz reddedilir; içinde categorize reddedilir; single+multiple alt sorularla kabul`
- [ ] **Step 3: `npm test` → FAIL**
- [ ] **Step 4: Şemayı yaz.** `z.preprocess` ile `kind` yoksa `"single"` ekle, ardından `z.discriminatedUnion("kind", …)`. Sınırlar: şık 2–12, kategori 2–8, kart 2–30, senaryo alt sorusu 1–20, metinler mevcut kurallar gibi trim+min(1); hata mesajları Türkçe (ör. "Her kategoride en az bir kart olmalı.", "Çok cevaplı soruda en az bir doğru şık olmalı.").
- [ ] **Step 5: `npm test` → PASS** (mevcut `quizSchema` testleri de)
- [ ] **Step 6: Commit** — `feat(quiz): soru tipleri için migration ve şema`

### Task 4: Veri katmanı ve sunucu uçları

**Files:**
- Create: `src/lib/quiz-data.ts` (`import "server-only"`)
- Modify: `src/lib/quiz-admin.ts` (`writeQuestions`)
- Modify: `src/app/api/client/quizzes/[quizId]/route.ts`, `src/app/api/client/quizzes/[quizId]/submit/route.ts`
- Modify: `src/app/api/admin/quizzes/[quizId]/route.ts` (GET + PUT silme sırası), `src/app/admin/sinav/[quizId]/page.tsx`
- Modify: `src/lib/lms.ts:108,208,211,467` ve `src/app/ogrenim/[slug]/sinav/[quizId]/page.tsx` (`question_count` → `type <> 'scenario'`)
- Modify: `scripts/test-api.mjs` (yeni tip senaryosu)

**Interfaces:**
- Consumes: Task 1–3.
- Produces (`quiz-data.ts`):
  - `loadQuiz(quizId: number): Promise<{ items: QuizItem[]; grading: Map<number, GradingQuestion> }>` — editör sırası (`position`, sonra `id`); `items` doğru bilgisi içermez.
  - `loadQuizForEditor(quizId: number): Promise<QuizInput["questions"]>`
  - `studentQuestions(items: QuizItem[]): PublicQuestion[]` — `orderForStudent(items, shuffle)` + her sorunun şıklarını/kartlarını `shuffle` ile karıştırır, kategoriler sabit.

- [ ] **Step 1: `writeQuestions`'ı union girdiye göre yaz** — `position` = dizideki sıra; senaryo önce yazılır, alt soruları `parent_id` ve aynı `quiz_id` ile; categorize: önce `question_categories`, sonra `options` (`category_id`, `is_correct = 0`). PUT'ta silme: önce `DELETE … WHERE quiz_id = ? AND parent_id IS NOT NULL`, sonra kalanlar.
- [ ] **Step 2: `quiz-data.ts`'i yaz** ve öğrenci GET'ini `studentQuestions(loadQuiz(...).items)` döndürecek şekilde değiştir (yanıttaki `questions` artık `PublicQuestion[]`; süre/oturum mantığı aynen).
- [ ] **Step 3: Gönderimi yeniden yaz** — `answers` şeması `z.record(z.string(), z.unknown())`; her `grading` sorusu için `gradeQuestion`, `scoreAttempt`; `quiz_attempts.answers`'a `{ id: result.answer }` yazılır; yanıt `{ score, isPassed, correctCount, points, totalQuestions, results: Record<string, GradeResult> }`. Süre/oturum kontrolleri aynen.
- [ ] **Step 4: Yönetici GET ve düzenleme sayfası** `loadQuizForEditor` kullanır.
- [ ] **Step 5: `question_count` sorgularını güncelle** (yukarıdaki satırlar; "sınavda soru var mı" `EXISTS` kontrolleri de `type <> 'scenario'`).
- [ ] **Step 6: `scripts/test-api.mjs`'e ekle** — mevcut final sınavı PUT'unu bir single + bir multiple (2 doğru) + bir categorize (2 kategori, 3 kart) + bir scenario (2 alt soru) ile güncelle; kontroller: GET'te 5 soru ve senaryo alt soruları bitişik, yanıtta `is_correct`/`category_id`/`correctOption` geçmez, multiple'da `correctCount === 2`; tüm doğru → 100; categorize'da 1 kart yanlış, diğerleri doğru → `score === Math.round((4 + 2/3) / 5 * 100)` (= 93); `results` categorize için `cardResults` içerir.
- [ ] **Step 7: Doğrula** — `npm test` PASS, `npm run typecheck` temiz. `test:api` migration uygulanınca (Task 8) çalıştırılır.
- [ ] **Step 8: Commit** — `feat(quiz): soru tipleri için veri katmanı ve API`

### Task 5: İnceleme verisi ve bileşeni

**Files:**
- Modify: `src/app/ogrenim/[slug]/sinav/[quizId]/page.tsx` (`loadReview`)
- Modify: `src/components/learn/QuizReview.tsx`

**Interfaces:**
- Consumes: `loadQuiz`, `gradeQuestion`, `parseStoredAnswers`, `PublicQuestion`, `GradeResult`.
- Produces: `type QuizReview = { score: number; attemptedAt: string; correctCount: number; questions: (PublicQuestion & { result: GradeResult })[] }` (editör sırası); `QuizExplanation` aynı kalır; yeni `QuestionResultView({ question, result })` — Task 6 sonuç adımında da kullanılır.

- [ ] **Step 1: `loadReview`'u yaz** — son `answers IS NOT NULL` denemesi; yalnızca `answers` anahtarında bulunan puanlanan sorular; her biri `gradeQuestion` ile yeniden puanlanır (doğru bilgisi sunucuda kalır). Eşleşen soru yoksa `null`.
- [ ] **Step 2: `QuestionResultView`'u yaz** — single/multiple: seçilen her şık doğru/yanlış işaretli ("Senin cevabın"), seçilmeyen doğru şık gösterilmez; multiple'da "N doğru cevaptan" bilgisi; categorize: her kategori başlığı altında öğrencinin koyduğu kartlar ✓/✗, yerleştirilmemiş kartlar ayrı "Yerleştirilmedi" grubunda, soru puanı yüzde ("%75"); açıklama `result.explanation` varsa.
- [ ] **Step 3: `QuizReviewSection`** — senaryo alt sorularını senaryo kartı altında grupla; "Yanlışlar" filtresi `points < 1`.
- [ ] **Step 4: `npm run typecheck`** temiz
- [ ] **Step 5: Commit** — `feat(quiz): yeni tipler için cevap incelemesi`

### Task 6: Öğrenci sınav akışı

**Files:**
- Modify: `package.json` (`@dnd-kit/core`)
- Create: `src/components/learn/quiz/ChoiceQuestion.tsx`, `src/components/learn/quiz/CategorizeQuestion.tsx`, `src/components/learn/quiz/ScenarioCard.tsx`
- Modify: `src/components/learn/QuizPlayer.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `PublicQuestion`, `Answer`, `isAnswered`, `GradeResult`, `QuestionResultView`.
- Produces:
  - `ChoiceQuestion({ question, value, onChange, disabled }: { question: Extract<PublicQuestion, { kind: "single" | "multiple" }>; value: number | number[] | undefined; onChange: (v: number | number[]) => void; disabled: boolean })`
  - `CategorizeQuestion({ question, value, onChange, disabled }: { question: Extract<PublicQuestion, { kind: "categorize" }>; value: Record<string, number> | undefined; onChange: (v: Record<string, number>) => void; disabled: boolean })`
  - `ScenarioCard({ scenario }: { scenario: ScenarioRef })`

- [ ] **Step 1: `npm install @dnd-kit/core`**
- [ ] **Step 2: `ChoiceQuestion`** — single: mevcut radyo görünümü; multiple: onay kutuları, üstte "N doğru cevabı seç" ve "x / N seçildi"; N seçiliyken seçilmemiş kutular devre dışı (seçimi kaldırmak serbest).
- [ ] **Step 3: `CategorizeQuestion`** — üstte "Kartlar" havuzu, altta kategori kutuları (grid, mobilde tek sütun). `DndContext` + `PointerSensor` (`activationConstraint: { distance: 6 }`), `TouchSensor` (`delay: 120, tolerance: 6`), `KeyboardSensor`. Ayrıca dokun-yerleştir: karta tıkla/dokun → seçili olur → kategoriye ya da havuza tıkla → taşınır. Kategorideki kart tekrar havuza ya da başka kategoriye taşınabilir. `disabled` iken etkileşim yok.
- [ ] **Step 4: `ScenarioCard`** — "Senaryo" etiketi, metin (`white-space: pre-line`), varsa senaryo sorusu vurgulu; 600 karakterden uzunsa daraltılmış başlar, "Devamını göster".
- [ ] **Step 5: `QuizPlayer`'ı güncelle** — `answers: Record<number, Answer>`; adım başına soru tipine göre bileşen; senaryo alt sorusunda üstte `ScenarioCard`; `answeredCount`/`allAnswered` `isAnswered` ile; otomatik sonraki soruya geçiş yalnızca single'da (mevcut kural); gönderim gövdesi `{ answers }` aynı; sonuç modunda adım içeriği `QuestionResultView`; kutucuk durumları `result.points === 1` → correct, `0 < points < 1` → yeni `partial` durumu, aksi wrong. Sonuç kartı: "%skor", "X / N tam doğru".
- [ ] **Step 6: CSS** — `.quiz-dot[data-state="partial"]` (yarı dolu), kategori kutuları, kart, seçili kart, sürüklenirken gölge; animasyonlar `prefers-reduced-motion: no-preference` içinde.
- [ ] **Step 7: `npm run typecheck`** temiz
- [ ] **Step 8: Commit** — `feat(quiz): öğrenci akışında yeni soru tipleri`

### Task 7: Yönetici editörü

**Files:**
- Create: `src/components/admin/quiz/ChoiceEditor.tsx`, `src/components/admin/quiz/CategorizeEditor.tsx`, `src/components/admin/quiz/ScenarioEditor.tsx`
- Modify: `src/components/admin/QuizEditor.tsx`

**Interfaces:**
- Consumes: `QuizInput["questions"]` tipi (Task 3), `loadQuizForEditor` çıktısı.
- Produces: her editör `{ value, onChange, onRemove }` alır; `value` Task 3'teki ilgili union üyesidir.

- [ ] **Step 1: `ChoiceEditor`** — tip seçimi Tek/Çok cevaplı (geçişte single'a dönerken yalnız ilk doğru korunur); single radyo, multiple onay kutusu; şık ekle/sil (2–12); açıklama alanı (mevcut).
- [ ] **Step 2: `CategorizeEditor`** — kategori listesi (ekle/sil/adlandır, 2–8; silinen kategoriye bağlı kartlar "kategori seçilmedi" olur), kart listesi (metin + kategori `<select>`, ekle/sil 2–30), açıklama; altta canlı uyarı: boş kategori / kategorisiz kart.
- [ ] **Step 3: `ScenarioEditor`** — senaryo metni, isteğe bağlı senaryo sorusu, içinde `ChoiceEditor` listesi + "+ Alt soru ekle".
- [ ] **Step 4: `QuizEditor`** — üst düzey liste union'a göre editör seçer; tip seçici (Tek cevaplı / Çok cevaplı / Sürükle-bırak) soru kartında; alt butonlar "+ Soru ekle" ve "+ Senaryo ekle"; her öğede yukarı/aşağı taşı. Kaydetmeden önceki temizlik mevcut gibi (boş şık/kart atılır), sunucu hataları mevcut `FormMessage` ile.
- [ ] **Step 5: `npm run typecheck`** temiz
- [ ] **Step 6: Commit** — `feat(admin): soru tipleri için sınav editörü`

### Task 8: Uygulama, uçtan uca doğrulama, mock kurs

**Files:** yok (DB ve tarayıcı)

- [ ] **Step 1: Kullanıcıdan onay al ve `npm run db:migrate`** — `008_question_types.sql` uygulandı; `SHOW COLUMNS FROM questions` ile `type, parent_id, scenario_prompt, position` görülür.
- [ ] **Step 2: `npm test` ve `npm run typecheck`** temiz.
- [ ] **Step 3: `npm run dev` + `npm run test:api`** (yönetici bilgileriyle; kullanıcıdan iste) → tüm kontroller ✓, yeni tip kontrolleri dahil.
- [ ] **Step 4: Mock kurs** — hangi sınava örnek soru ekleneceğini kullanıcıya sor (mevcut sorular PUT ile değişir); her tipten en az bir soru + 2 alt sorulu bir senaryo, yanlışlarda açıklamalı. Yönetici editöründen ya da admin API'siyle.
- [ ] **Step 5: Tarayıcıda dene** — editörde yükle/kaydet; öğrenci olarak sınav: multiple seçim sınırı, categorize fareyle ve dar ekranda dokun-yerleştir, senaryo kartı, bilerek yanlışlar → sonuçta kısmi kutucuk, açıklamalar; "Cevaplarımı gör" incelemesi; eski tek cevaplı sınav hâlâ çalışıyor.

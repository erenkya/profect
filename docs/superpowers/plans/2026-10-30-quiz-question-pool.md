# Sınav modları: sabit sınav ve soru havuzu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her sınav "sabit sınav" ya da "soru havuzu" modunda çalışsın; havuzda öğrenci başına rastgele, kesin sorular ve tip kotalarıyla seçilmiş bir set çıksın.

**Architecture:** Çekim ve doğrulama mantığı saf bir modülde (`src/lib/quiz-pool.ts`, rastgelelik dışarıdan verilir) yazılır ve `node --test` ile test edilir. Sunucu, öğrenci için yeni oturum açılırken çekimi yapar ve yalnızca çekilen soruları `quiz_sessions.question_order` içinde saklar; gönderim yalnızca o kümeyi puanlar. Sınav ayarları `quizzes` tablosuna, "kesin" bayrağı `questions` tablosuna eklenir.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, zod 3, mysql2 (MariaDB/MySQL), `node --test` ile `src/lib/*.test.ts`.

**Spec:** `docs/superpowers/specs/2026-10-30-quiz-question-pool-design.md` (okunmadan başlanmaz; mesaj metinleri ve kurallar oradan alınır)

## Global Constraints

- Arayüz ve hata metinleri Türkçe. Kod yorumları da mevcut dosyalardaki gibi Türkçe, kısa.
- Doğru cevap bilgisi öğrenciye asla gitmez; "kesin" bayrağı da öğrenciye giden JSON'da bulunmaz.
- Mevcut sınavlar, denemeler ve sertifikalar bozulmaz: migration mevcut sınavları `mode='pool'`, `draw_count=NULL` yapar (bugünkü "hepsi karışık" davranışı). Yeni sınav varsayılanı `fixed`.
- `draw_count` NULL = havuzun tamamı. Tip kotası yalnızca pozitif tam sayı olabilir; boş/yok = kota yok.
- Sabit sınav: soru sırası editör sırası, şıklar/kartlar karışık. Senaryo alt soruları havuzda bağımsız çekilir, kendi tipinin kotasına sayılır, çıkanlar yan yana ve editör sırasında kalır.
- Tüm pure modüller `.ts` uzantılı göreli import kullanır (mevcut `quiz-*.ts` gibi, `node --experimental-strip-types` ile çalışsınlar). `server-only` import eden dosyalar birim test edilemez.
- Komutlar: `npm test`, `npm run typecheck`, `npm run db:migrate` (`.env` ve DB gerekir).
- AGENTS.md: bu Next.js sürümü farklı; route/sayfa dosyalarına dokunan görevlerde (4, 5, 7) önce `node_modules/next/dist/docs/` altındaki ilgili kılavuzu oku, mevcut dosyaların desenini (async `params`, `requireUser`, `fail/ok`) izle.
- Commit mesajları `feat:` / `test:` öneki kullanır ve şu satırla biter: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Spec'in ima ettiği ama görev testlerinin doğal olarak kapsamadığı durumlar; her birinin testi sahibi görevde:

1. Havuzdaki tüm sorular kesin ve `draw_count` = kesin sayısı: hepsi çıkar, rastgelelikten bağımsız (Görev 1).
2. Senaryodan yalnızca bir alt soru çekilirse senaryo kartıyla gelir; hiç çekilmezse senaryo sınavda görünmez (Görev 2).
3. Eğitmen havuzdan sabit moda geçerken eski `draw_count` ve kesin işaretlerini bırakır: hata vermeden kaydedilir (Görev 3).
4. Kota alanına `0`, boşluk ya da yazı girilmesi: formda "kota yok" sayılır, sunucu `0`'ı reddeder (Görev 3, 7).
5. Öğrenci sınavdayken eğitmen kaydeder: gönderim 409 döner ve oturum tüketilmez; öğrenciye giden JSON'da kesin bayrağı yoktur (Görev 4).

## File Structure

| Dosya | Sorumluluk |
|---|---|
| `db/migrations/012_quiz_pool.sql` (yeni) | `quizzes.mode/draw_count/draw_by_type`, `questions.is_required` |
| `src/lib/quiz-pool.ts` (yeni) | Saf: doğrulama, çekim, öğrenci seti seçimi, JSON ayrıştırma |
| `src/lib/quiz-pool.test.ts` (yeni) | Yukarıdakilerin testleri |
| `src/lib/quiz-model.ts` | `applySavedOrder` alt küme seçeneği, `pickItems` |
| `src/lib/admin-schemas.ts` | `quizBaseSchema`/`quizSchema`, `is_required` |
| `src/lib/quiz-admin.ts`, `src/lib/quiz-data.ts` | Kaydetme/yükleme; `loadQuiz` ayar döndürür |
| `src/app/api/client/quizzes/[quizId]/route.ts`, `.../submit/route.ts` | Çekim ve alt kümeyle puanlama |
| `src/lib/lms.ts`, sınav giriş sayfası, `CourseBuilder.tsx` | Gösterilen soru sayısı |
| `src/lib/quiz-editor.ts`, `src/lib/quiz-csv.ts` | Editör durumu, CSV `kesin` sütunu |
| `src/components/admin/quiz/PoolSettings.tsx` (yeni), `QuizEditor.tsx`, `ChoiceEditor.tsx`, `CategorizeEditor.tsx`, `ScenarioEditor.tsx` | Editör arayüzü |

---

### Task 1: Migration ve saf havuz modülü (doğrulama + çekim)

**Files:**
- Create: `db/migrations/012_quiz_pool.sql`, `src/lib/quiz-pool.ts`
- Test: `src/lib/quiz-pool.test.ts`

**Interfaces:**
- Produces (`quiz-pool.ts`):
  - `type PoolKind = "single" | "multiple" | "categorize"`
  - `type PoolEntry = { id: number; kind: PoolKind; required: boolean }`
  - `type PoolConfig = { drawCount: number | null; byType: Partial<Record<PoolKind, number>> }`
  - `const KIND_LABEL: Record<PoolKind, string>` = tek cevaplı / çok cevaplı / sürükle-bırak
  - `validatePool(entries: { kind: PoolKind; required: boolean }[], cfg: PoolConfig): string[]` — boş dizi = geçerli
  - `drawIds(entries: PoolEntry[], cfg: PoolConfig, shuffle: <T>(a: T[]) => T[]): number[]`
  - `parseByType(raw: unknown): Partial<Record<PoolKind, number>>` — MariaDB metin / MySQL nesne; geçersiz anahtar ve pozitif tam sayı olmayan değerler atılır

- [ ] **Step 1: Migration yaz.** `012_quiz_pool.sql`: `quizzes`'e `mode ENUM('fixed','pool') NOT NULL DEFAULT 'fixed'`, `draw_count INT UNSIGNED NULL`, `draw_by_type JSON NULL` ekle; **ardından** `UPDATE quizzes SET mode = 'pool'` (mevcut sınavlar); `questions`'a `is_required TINYINT(1) NOT NULL DEFAULT 0 AFTER position` ekle. Başına migration 008/009 gibi Türkçe açıklama yorumu.

- [ ] **Step 2: Başarısız testleri yaz** (`node:test`, `assert/strict`; `identity = <T,>(a: T[]) => a`, `reverse` ile iki yönde çalıştır). `validatePool` için (hata metinlerini `errors.some((e) => e.includes(...))` ile kontrol et; metinler spec'teki doğrulama listesiyle birebir şu kalıpta: `Sınavda ${N} soru istendi ama havuzda ${P} soru var.` · `Kesin işaretli ${R} soru var ama sınavda yalnızca ${N} soru gösterilecek.` · `Kesin işaretli ${r} soru var ama ${etiket} kotası ${q}.` · `${etiket} kotası ${q} ama havuzda ${p} ${etiket} soru var.` · `Tip kotaları ve kesin sorular en az ${S} soru gerektiriyor ama sınavda ${N} soru gösterilecek.`):
  - 30 soruluk havuz, `drawCount: 20`, kota yok → `[]`
  - `drawCount: 31` (30 soru) → "havuzda 30 soru var" içeren hata
  - 21 kesin soru, `drawCount: 20` → "yalnızca 20" içeren hata
  - 4 kesin tek cevaplı, `byType: { single: 3 }` → "tek cevaplı kotası 3"
  - havuzda 8 tek cevaplı, `byType: { single: 10 }` → "havuzda 8 tek cevaplı"
  - `drawCount: 20`, `byType: { single: 10, multiple: 10, categorize: 5 }` → "en az 25"
  - `drawCount: 5`, `byType: { single: 5 }`, 1 kesin çok cevaplı → "en az 6"
  - `drawCount: null`, 10 soru, `byType: { single: 4 }` (4+ tek cevaplı var) → `[]` (N = havuz boyutu)
  
  `drawIds` için (6 tek, 6 çok, 6 sürükle-bırak; ids 1–18):
  - kesin sorular her zaman dahil, sonuç `drawCount` uzunluğunda ve tekrarsız
  - `drawCount: 9`, `byType` her tipe 3 → tam olarak tipten 3'er (identity ve reverse ile)
  - `drawCount: 5`, `byType: { single: 2 }` → toplam 5, en az 2 tek cevaplı
  - 2 kesin tek cevaplı + `byType: { single: 3 }`, `drawCount: 3` → tam 3 tek cevaplı ve 2 kesin dahil
  - `drawCount: null` → tüm id'ler
  - havuzdan büyük `drawCount` → hata fırlatmaz, mevcut tüm soruları döndürür
  - **Review Focus 1:** tüm 18 soru kesin, `drawCount: 18` → 18 id'nin tamamı
  
  `parseByType`: `'{"single":5,"x":2,"multiple":0}'` → `{ single: 5 }`; nesne girdisi; `null` ve bozuk metin → `{}`.

- [ ] **Step 3: Testlerin başarısız olduğunu doğrula.** `node --experimental-strip-types --disable-warning=ExperimentalWarning --test src/lib/quiz-pool.test.ts` → modül bulunamadı hatasıyla FAIL.

- [ ] **Step 4: `quiz-pool.ts`'i uygula.** `validatePool`: N = `drawCount ?? pool boyutu`; spec'teki beş kuralı sırayla uygular, bulduğu her ihlali ayrı mesaj olarak döndürür. `drawIds`: spec "Çekim kuralları" 1–3. adımları: kesinler → kotalı tiplerde `kota − kesin` kadar kesin olmayandan `shuffle(adaylar).slice(0, k)` → kalan yerler seçilmemiş tüm sorulardan `shuffle` ile; `drawCount` null ise hepsi; havuz yetmezse eldekini döndürür.

- [ ] **Step 5: Testlerin geçtiğini doğrula** (aynı komut) → PASS. Ardından `npm test` tüm süit PASS.

- [ ] **Step 6: Commit** — migration, modül, test **ve** `docs/superpowers/specs/2026-10-30-quiz-question-pool-design.md` + bu plan dosyası: `feat: add quiz pool migration and pool draw/validation module`.

---

### Task 2: Alt küme sırası ve öğrenci seti seçimi

**Files:**
- Modify: `src/lib/quiz-model.ts` (`applySavedOrder`, yeni `pickItems`), `src/lib/quiz-pool.ts` (yeni `selectForStudent`)
- Test: `src/lib/quiz-model.test.ts`, `src/lib/quiz-pool.test.ts`

**Interfaces:**
- Consumes: Görev 1'den `PoolConfig`, `PoolEntry`, `drawIds`.
- Produces:
  - `applySavedOrder(qs: PublicQuestion[], saved: SavedOrder, opts?: { subset?: boolean }): PublicQuestion[] | null` — `subset: true` iken `saved.length === qs.length` koşulu aranmaz; kayıtlı her soru `qs` içinde olmalı ve şık/kart kümesi eşleşmelidir (aksi `null`). `opts` yoksa bugünkü davranış aynen.
  - `pickItems(items: QuizItem[], ids: ReadonlySet<number>): QuizItem[]` — seçilmeyen sorular düşer; senaryonun seçilen alt soruları editör sırasında kalır; hiç alt sorusu seçilmeyen senaryo düşer.
  - `type QuizSetup = { mode: "fixed" | "pool" } & PoolConfig`
  - `selectForStudent(items: QuizItem[], required: ReadonlySet<number>, setup: QuizSetup, shuffle: <T>(a: T[]) => T[]): PublicQuestion[]` — `fixed`: puanlanan sorular editör sırasıyla, karıştırma yok, `required` yok sayılır. `pool`: `drawIds` → `pickItems` → `orderForStudent(…, shuffle)`. (Şık/kart karıştırma bu fonksiyonda değil, Görev 4'te.)

- [ ] **Step 1: Başarısız testleri yaz.**
  - `quiz-model.test.ts`: 3 soruluk `qs`, `saved` 2 soru → `{ subset: true }` ile bu 2 soru **saved sırasında** döner; `opts` olmadan `null`; `saved` içinde `qs`'te olmayan id → `{ subset: true }` ile bile `null`; şık kümesi farklıysa `null`.
  - `quiz-model.test.ts` **Review Focus 2:** 3 alt soruları senaryo + 1 tek soru; `ids` = {tek soru, senaryonun 2. alt sorusu} → senaryo öğesi 1 alt soruyla kalır; `ids` yalnızca tek soruyu içerirse senaryo öğesi çıktıda yoktur.
  - `quiz-pool.test.ts`: `fixed` modda senaryo alt soruları dahil editör sırası korunur ve `required` yok sayılır; `pool`, `drawCount: 3`, 1 senaryo (3 alt soru) + 4 tek soru, bir alt soru kesin, `shuffle = reverse` → uzunluk 3, kesin dahil, aynı senaryodan çıkanlar bitişik ve editör sırasında.

- [ ] **Step 2: Başarısız olduklarını doğrula.** `node --experimental-strip-types --disable-warning=ExperimentalWarning --test src/lib/quiz-model.test.ts src/lib/quiz-pool.test.ts` → FAIL.

- [ ] **Step 3: Uygula.** İmzalar yukarıda; `selectForStudent` giriş öğelerinden `PoolEntry` listesini (`kind` = sorunun `kind`'ı, `required` = `required.has(id)`) kendisi çıkarır.

- [ ] **Step 4: `npm test` PASS ve `npm run typecheck` temiz.**

- [ ] **Step 5: Commit** — `feat: subset saved order and student set selection for quiz pool`.

---

### Task 3: Şema ve kayıt (zod, kaydetme, yükleme)

**Files:**
- Modify: `src/lib/admin-schemas.ts` (quiz bölümü), `src/lib/quiz-admin.ts`, `src/lib/quiz-data.ts` (`loadQuizForEditor`), `src/app/api/admin/quizzes/route.ts`, `src/app/api/admin/quizzes/[quizId]/route.ts`
- Test: `src/lib/admin-schemas.test.ts`

**Interfaces:**
- Consumes: `validatePool`, `PoolKind` (Görev 1).
- Produces:
  - `quizBaseSchema` (`z.object`): mevcut alanlar + `mode: z.enum(["fixed","pool"]).default("fixed")`, `draw_count: z.number().int().min(1).max(200).nullable().default(null)`, `draw_by_type: z.object({ single, multiple, categorize })` (her biri `z.number().int().min(1).max(200).optional()`, `.strict()`, `.default({})`).
  - `quizSchema = quizBaseSchema.superRefine(…)`: `mode === "pool"` iken soruları düzleştirir (senaryo alt soruları kendi tipiyle, senaryonun kendisi hariç), `validatePool` mesajlarını `custom` issue olarak ekler. `mode === "fixed"` iken havuz kontrolü yok.
  - tek/çok cevaplı ve sürükle-bırak soru şemalarına `is_required: z.boolean().default(false)` (senaryo alt soruları dahil; senaryonun kendisine yok).
  - `loadQuizForEditor` her soruda (alt sorular dahil) `is_required` döndürür; `GET /api/admin/quizzes/:id` zaten `SELECT *` ile `mode`, `draw_count`, `draw_by_type` döndürür.

- [ ] **Step 1: Başarısız testleri yaz** (`quizSchema.safeParse`; yardımcı: `n` tek cevaplı geçerli soru üreten fonksiyon):
  - `mode: "pool"`, 3 soru, `draw_count: 2`, bir soru `is_required: true` → success
  - `mode: "pool"`, 3 soru, `draw_count: 5` → fail
  - **Review Focus 3:** `mode: "fixed"`, 3 soru, `draw_count: 99`, bir soruda `is_required: true`, `draw_by_type: { single: 50 }` → success
  - **Review Focus 4:** `draw_by_type: { single: 0 }` → fail (her modda)
  - `is_required` verilmeyen soru → parse sonrası `false`
  - senaryo alt sorusunda `is_required: true` + `mode: "pool"`, `draw_count: 1`, `draw_by_type: { multiple: 1 }`, alt soru tek cevaplı → fail (kesin soru kotasız tipte sayılır ama kotalı toplam aşılır; en az bir `validatePool` mesajı)

- [ ] **Step 2: Başarısız olduklarını doğrula.** `node … --test src/lib/admin-schemas.test.ts` → FAIL.

- [ ] **Step 3: Şemayı uygula** (`quizBaseSchema`/`quizSchema` ayrımı: `POST /api/admin/quizzes` bugün `quizSchema.partial(…)` kullanıyor ve `ZodEffects` `.partial` taşımaz → POST `quizBaseSchema.omit({ mode: true, draw_count: true, draw_by_type: true }).partial({ questions: true, duration_minutes: true })` kullanır; yeni sınav `fixed` doğar. `z.infer<typeof quizSchema>` kullanan dosyalar (`quiz-admin.ts`, `quiz-data.ts`, `QuizEditor.tsx`) tip olarak çalışmaya devam eder.)

- [ ] **Step 4: Kaydet/yükle.** `writeQuestions`/`writeChoice`/categorize `INSERT`'lerine `is_required` ekle (senaryo satırı 0). `PUT /api/admin/quizzes/:id` `UPDATE`'i `mode`, `draw_count`, `draw_by_type`'ı (`JSON.stringify` ya da boş nesne ise `NULL`) da yazar. `loadQuizForEditor` `QRow`'a `is_required` ekler ve döndürür.

- [ ] **Step 5: `npm test` PASS, `npm run typecheck` temiz.** Editör (`QuizEditor.tsx`) `is_required`'ı henüz taşımadığı için bu görevden sonra kaydedilen sınavlarda kesin işaretleri sıfırlanır; bu, Görev 6–7 ile kapanır ve o ana kadar arayüzde işaret koyma yolu da yoktur. Typecheck hata verirse bu görevde en küçük düzeltmeyi yap (yeni zorunlu alan eklemeden).

- [ ] **Step 6: Commit** — `feat: quiz pool settings and required flag in schema and persistence`.

---

### Task 4: Sunucu akışı — çekim, devam etme, alt kümeyle puanlama

**Files:**
- Modify: `src/lib/quiz-data.ts` (`loadQuiz`, `studentQuestions`), `src/app/api/client/quizzes/[quizId]/route.ts`, `src/app/api/client/quizzes/[quizId]/submit/route.ts`, `scripts/test-api.mjs`

**Interfaces:**
- Consumes: `QuizSetup`, `selectForStudent` (Görev 2), `parseByType` (Görev 1).
- Produces:
  - `loadQuiz(quizId): Promise<{ items: QuizItem[]; grading: Map<number, GradingQuestion>; setup: QuizSetup; required: Set<number> }>` — `setup` `quizzes` satırından (`mode`, `draw_count`, `parseByType(draw_by_type)`), `required` `questions.is_required = 1` olan puanlanan soru id'lerinden.
  - `studentQuestions(items: QuizItem[], required: ReadonlySet<number>, setup: QuizSetup): PublicQuestion[]` — `selectForStudent(…, shuffle)` sonrası şık/kart karıştırma (bugünkü gibi).

- [ ] **Step 1: Next.js kılavuzunu oku** (`node_modules/next/dist/docs/01-app` altında route handler bölümü) ve iki route dosyasının mevcut desenine uy.

- [ ] **Step 2: `quiz-data.ts`'i güncelle** (imzalar yukarıda). `loadQuiz`'in diğer çağıranı olan `src/app/ogrenim/[slug]/sinav/[quizId]/page.tsx` yalnızca `items`/`grading` kullanır; değişiklik gerekmez. `loadReview` zaten yalnızca deneme cevaplarındaki soruları incelediği için çekilen alt kümeyle çalışır.

- [ ] **Step 3: GET route.** Yeni oturumda/geçersiz kayıtta `studentQuestions(items, required, setup)`; devam etmede `applySavedOrder(flatQuestions(items), saved, { subset: setup.mode === "pool" })`. Yanıtta `required`/`is_required` alanı olmaz. Geri kalan davranış (süre, taslak cevaplar, `snapshotOrder`) aynı.

- [ ] **Step 4: Submit route.** `loadQuiz`'i oturum tüketilmeden **önce** çağır. `mode === "pool"` ise (süreli ya da süresiz): açık oturum yoksa mevcut 409 mesajıyla dön; oturumdaki `question_order` id'lerinden biri `grading`'de yoksa **oturumu tüketmeden** `409` + `"Sınav güncellendi; sınavı yeniden başlatın."` dön; sonra mevcut atomik `submitted_at` güncellemesi ve süre kontrolü; yalnızca oturumdaki id'leri puanla; `totalQuestions` puanlanan sayıdır; çekilmemiş sorulara gelen cevaplar yok sayılır. `fixed` + süresiz: bugünkü davranış (tüm sorular).

- [ ] **Step 5: `scripts/test-api.mjs`'e kontroller ekle** (mevcut `check(...)`/`api(...)` yardımcılarıyla, final sınav bölümünün sonuna): yönetici bir modül sınavını `mode: "pool"`, 4 soru, `draw_count: 2`, bir soru `is_required: true` ile kaydeder → kullanıcı GET: tam 2 soru döner, kesin soru içinde, JSON'da `is_required` ve `required` geçmez (**Review Focus 5**); aynı oturumda ikinci GET aynı soru id'lerini verir; submit `totalQuestions === 2`; yönetici sınavı yeniden kaydedince (yeni id'ler) açık oturumdaki bir kullanıcının submit'i `409` döner ve yeniden GET yeni set verir.

- [ ] **Step 6: Doğrula.** `npm run typecheck` temiz. `.env` ve DB mevcutsa `npm run db:migrate` sonra `npm run test:api` (dev sunucu açık) → yeni kontroller dahil tümü geçer; değilse bu adımı "çalıştırılamadı" diye raporla, geçti deme.

- [ ] **Step 7: Commit** — `feat: draw quiz questions per session and grade only drawn set`.

---

### Task 5: Gösterilen soru sayısı

**Files:**
- Modify: `src/lib/lms.ts` (`getCourseTree`, `getCourseAdminTree`, `AdminQuizRef`), `src/app/ogrenim/[slug]/sinav/[quizId]/page.tsx`, `src/components/admin/CourseBuilder.tsx:283`

**Interfaces:**
- Produces: `lms.ts`'te `export const quizShownCountSql = (alias: string): string` — `IF(${alias}.mode = 'pool' AND ${alias}.draw_count IS NOT NULL, ${alias}.draw_count, (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = ${alias}.id AND x.type <> 'scenario'))`. `AdminQuizRef` yeni alan `pool_count: number`.

- [ ] **Step 1:** Next.js kılavuzunu (sunucu bileşeni/sayfa bölümü) tara; mevcut sayfa desenine uy.
- [ ] **Step 2:** `getCourseTree` ve `getCourseAdminTree`'deki `question_count` alt sorgularını `quizShownCountSql("q")` ile değiştir; admin ağacında ayrıca eski alt sorguyu `pool_count` olarak seç. Sınav giriş sayfasındaki `question_count` sorgusunu da aynı yardımcıyla değiştir (`quizzes` tablosu takma ad olmadan kullanılıyor; yardımcıyı `quizzes` adıyla çağır). "Soru var mı" `EXISTS` kontrolleri (`QUIZ_TOTAL_SQL`, `QUIZ_PASSED_SQL`) değişmez.
- [ ] **Step 3:** `CourseBuilder.tsx`: `pool_count !== question_count` ise "havuz {pool_count} · sınavda {question_count} soru", değilse bugünkü "{question_count} soru".
- [ ] **Step 4: Doğrula.** `npm run typecheck` temiz. Dev sunucuda (`npm run dev`) havuz modunda `draw_count: 2` olan bir sınav için kurs sayfasının (`/kurslar/<slug>`) ve sınav giriş ekranının "2 soru" gösterdiğini, admin kurs ekranının "havuz 4 · sınavda 2 soru" gösterdiğini tarayıcıda doğrula; yapamazsan bunu açıkça raporla.
- [ ] **Step 5: Commit** — `feat: show drawn question count for pool quizzes`.

---

### Task 6: Editör durumu ve CSV `kesin` sütunu

**Files:**
- Modify: `src/lib/quiz-editor.ts`, `src/lib/quiz-csv.ts`
- Test: `src/lib/quiz-editor.test.ts`, `src/lib/quiz-csv.test.ts`

**Interfaces:**
- Consumes: `PoolKind`, `PoolConfig` (Görev 1); `is_required: boolean` çıktısı veren `quizSchema` (Görev 3).
- Produces (`quiz-editor.ts`):
  - `ChoiceQ` ve `CatQ`'ya `is_required: boolean`; `toEditor`, `blankChoice`, `blankCategorize` bunu doldurur (`false`); `changeKind` tip değişiminde korur.
  - `poolFromEditor(items: EditorItem[]): { kind: PoolKind; required: boolean }[]` — senaryo alt soruları düzleşir, senaryonun kendisi yok.
  - `configFromForm(drawCount: string, byType: Record<PoolKind, string>): PoolConfig` — boş/`0`/sayı olmayan/negatif değer atılır (`drawCount` → `null`, kota → anahtar yok); **Review Focus 4**.

- [ ] **Step 1: Başarısız testleri yaz.**
  - `quiz-editor.test.ts`: `changeKind` `is_required: true` değerini her tip geçişinde korur; `poolFromEditor` — tek soru + 2 alt soruluk senaryo → 3 giriş, `required` bayrakları taşınır; `configFromForm("", { single: "", multiple: "3", categorize: "" })` → `{ drawCount: null, byType: { multiple: 3 } }`; `configFromForm("20", { single: "0", multiple: "abc", categorize: " 5 " })` → `{ drawCount: 20, byType: { categorize: 5 } }`.
  - `quiz-csv.test.ts`: başlık `…,aciklama,kesin`, `kesin` = `evet` → `is_required` true; boş ve `hayır` → false; `belki` → hata ("kesin" geçen, satır numaralı); senaryo satırında `evet` → hata; senaryo **alt sorusunda** `evet` → alt soruda true; `kesin` sütunsuz eski başlık hâlâ çözülür; şablon çözülür ve en az bir şablon satırı `is_required: true` verir. Mevcut `"şablon BOM'lu ve CRLF'li"` testinin beklediği başlık `…,aciklama,kesin` olacak şekilde güncellenir.

- [ ] **Step 2: Başarısız olduklarını doğrula** — `node … --test src/lib/quiz-editor.test.ts src/lib/quiz-csv.test.ts` → FAIL.

- [ ] **Step 3: Uygula.** CSV: `CSV_COLUMNS` sonuna `"kesin"` (zorunlu sütunlara eklenmez); değer kümesi evet|e|1|x|true = kesin, boş|hayir|h|0|false = değil (`fold` ile); diğerleri satır hatası; değer `quizItemSchema`'ya `is_required` olarak gider. Şablon: her satıra 8. hücre, ilk tek cevaplı örnekte `evet`; `TEMPLATE_NOTES`'a `kesin` açıklaması ("evet yazılan soru havuz sınavında her öğrenciye çıkar; yalnızca soru satırlarında; boş = değil").

- [ ] **Step 4:** `npm test` PASS, `npm run typecheck` temiz (Görev 3'ten kalan editör tip hataları burada kapanır).

- [ ] **Step 5: Commit** — `feat: required flag in editor state and CSV import`.

---

### Task 7: Yönetici editörü arayüzü

**Files:**
- Create: `src/components/admin/quiz/PoolSettings.tsx`
- Modify: `src/components/admin/QuizEditor.tsx`, `src/components/admin/quiz/ChoiceEditor.tsx`, `CategorizeEditor.tsx`, `ScenarioEditor.tsx`, `src/app/admin/sinav/[quizId]/page.tsx`

**Interfaces:**
- Consumes: `validatePool`, `KIND_LABEL`, `parseByType` (Görev 1); `poolFromEditor`, `configFromForm` (Görev 6).
- Produces: `PoolSettings` props `{ mode: "fixed" | "pool"; onMode(m): void; drawCount: string; onDrawCount(v): void; byType: Record<PoolKind, string>; onByType(k: PoolKind, v: string): void; poolCounts: Record<PoolKind, number>; total: number; remaining: number | null; problems: string[] }`. `ChoiceEditor`/`CategorizeEditor`/`ScenarioEditor`'a isteğe bağlı `showRequired?: boolean` prop'u.

- [ ] **Step 1:** Next.js kılavuzunda istemci/sunucu bileşeni sınırını kontrol et; mevcut admin sayfası desenine uy. Admin `sinav/[quizId]/page.tsx`: sorguya `mode, draw_count, draw_by_type` ekle, `initial`'a `mode`, `drawCount: number | null`, `drawByType: parseByType(…)` olarak geçir.
- [ ] **Step 2: `PoolSettings`.** "Sınav türü" iki seçenek: Sabit sınav / Soru havuzu. Havuzdaysa: "Sınavda gösterilecek soru sayısı" (boş = hepsi, placeholder "hepsi · {total}"), "Tipe göre dağılım" (üç tip için sayı kutusu, her birinin yanında "havuzda {n}"), "kalan {remaining} soru rastgele" göstergesi (kota/kesin toplamı N'yi aşıyorsa gösterilmez), `problems` kırmızı liste. Mevcut admin sınıflarını (`field`, `input`, `card`) kullan.
- [ ] **Step 3: `QuizEditor` bağla.** Durum: `mode`, `drawCount`, `byType`; `problems = mode === "pool" ? validatePool(poolFromEditor(clean(qs)), configFromForm(drawCount, byType)) : []`; `problems` doluyken "Sınavı kaydet" devre dışı ve gerekçe görünür; kayıt gövdesine `mode`, `draw_count` (`configFromForm(…).drawCount`), `draw_by_type` (`configFromForm(…).byType`) eklenir. `clean()` `is_required`'ı korur. Havuz modunda her soru kartı ve senaryo alt sorusu "Kesin çıksın" onay kutusu gösterir (`showRequired`); sabit modda gizli ama değer korunur.
- [ ] **Step 4: Doğrula.** `npm test` ve `npm run typecheck` temiz. Dev sunucuda `/admin/sinav/<id>`: havuz seç, 30'dan fazla soru isteyince hata listesi görünür ve kayıt kapanır; kesin işaretle, kota gir, "kalan" göstergesi güncellenir, kaydet, sayfayı yenile — ayarlar ve işaretler geri gelir; CSV'den `kesin=evet` ile yükle, kutu işaretli gelir; sabit moda dön, hata listesi kaybolur ve kayıt çalışır. Tarayıcıda doğrulayamazsan bunu açıkça raporla.
- [ ] **Step 5: Commit** — `feat: quiz mode and pool settings in admin editor`.

---

## Self-Review

- **Spec kapsamı:** iki mod → G1/G2/G4; kesin + tip kotası → G1; çekim kuralları 1–4 → G1/G2; migration ve mevcut sınavların korunması → G1; oturum zorunluluğu, alt küme `applySavedOrder`, bayat oturum 409, oturum ömrü (değişmez) → G2/G4; gönderim yalnızca çekilenleri puanlar → G4; soru sayısı gösterimleri → G5; kayıtta doğrulama → G1/G3; editör ve CSV → G6/G7; `QuizReview` zaten alt kümeyle çalışır (`loadReview` cevaplardaki soruları süzer) → G4 Step 2'de not düşüldü; AGENTS.md → Genel kısıtlar ve G4/5/7.
- **Tip tutarlılığı:** `PoolKind`, `PoolConfig`, `PoolEntry`, `QuizSetup`, `drawIds`, `selectForStudent`, `parseByType`, `poolFromEditor`, `configFromForm` adları görevler arasında aynı.
- **Orantı:** Kod gövdeleri yerine imza, test iddiaları ve spec değerleri verildi; yalnızca migration ve çekim algoritması sözel tarif edildi.

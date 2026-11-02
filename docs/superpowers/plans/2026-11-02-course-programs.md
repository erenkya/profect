# Uzmanlık Programı (Ana Kurs / Bundle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Birkaç kursu tek paket altında toplayan, kişiye özel düşümlü fiyatlanan, hediye edilebilen ve tüm kurslar bitince otomatik sertifika veren "Uzmanlık Programı" eklemek.

**Architecture:** Yeni `programs` / `program_courses` / `program_enrollments` / `program_certificates` tabloları mevcut kurs, sipariş ve hediye yapısının yanına eklenir; program yalnızca kursları gruplar. Fiyat, düşüm ve "tamamlandı mı" kararları DB'siz saf fonksiyonlarda (`program-pricing.ts`, `program-rules.ts`) yaşar ve birim testlenir; DB'ye dokunan kısım `programs.ts` içinde toplanır. Satın alma mevcut sepet → `createCartOrder` → `fulfillOrder` hattına yeni bir kalem türü (`program`) olarak, hediye mevcut `gifts` hattına `program_id` ile eklenir.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), React 19, MySQL (`mysql2`, düz SQL), zod, `node --test` (saf mantık), `scripts/test-*.mjs` (uçtan uca, çalışan sunucu + gerçek DB), dnd-kit (admin sıralama).

**Spec:** `docs/superpowers/specs/2026-11-02-course-programs-design.md`

## Global Constraints

- `AGENTS.md`: Next.js 16 bildiğin Next.js değildir; sayfa/route yazmadan önce `node_modules/next/dist/docs/` içindeki ilgili kılavuzu oku. Mevcut desenler: `params` bir `Promise`'tır, koruma `src/proxy.ts`'te, arka plan işi `after()`.
- Düz SQL (`mysql2`), ORM yok. Migration `db/migrations/018_programs.sql` (son: 016; başka bir dalda 017_posts.sql var, bu yüzden 018). `npm run db:migrate` ile uygulanır.
- Tüm kullanıcıya görünen metinler Türkçe. Kullanıcıya görünen ad **"Uzmanlık Programı"**, kodda "program". Herkese açık rotalar `/programlar`, `/programlar/[slug]`; hesap rotası `/hesabim/programlarim`; admin `/admin/programlar`.
- Saf mantık dosyaları (`program-pricing.ts`, `program-rules.ts`) `server-only` içermez ve diğer dosyaları `.ts` uzantısıyla içe aktarır (bkz. `src/lib/gift-rules.ts`) ki `node --test` ile yüklensin.
- Testler: saf mantık için `npm test` (tek dosya: `node --experimental-strip-types --disable-warning=ExperimentalWarning --test src/lib/<dosya>.test.ts`); DB'li akışlar için `scripts/test-programs.mjs` (`npm run test:programs`, `npm run dev` açıkken, `MAIL_DRY_RUN=true`); tip kontrolü `npm run typecheck`.
- **Fiyat kuralı (kesin):** `S` = kursların güncel liste fiyatları toplamı, `B` = program fiyatı, `B' = min(B, S)`, `r = B'/S` (`S = 0` ise `r = 1`). `kredi = round2(Σ edinilmiş kursların liste fiyatı × r)`, `ödenecek = B' − kredi`; `0 ≤ ödenecek ≤ B'` ve `ödenecek ≤ Σ edinilmemiş kursların liste fiyatı`. Hediye fiyatı = `B'` (edinilmiş küme boş).
- **Edinilmiş kurs** = `enrollments` satırı olup `source <> 'plus'`. Plus aktifliği ve `plus` kaynaklı kayıtlar sayılmaz. Satın alma/hediye ile gelen kayıt, mevcut `plus` kaynaklı satırı kalıcı kaynağa **yükseltir** (`INSERT IGNORE` bunu yapmaz).
- Tutar, kredi, sahiplik ve sertifika uygunluğu yalnızca sunucuda; istemciden yalnızca "hangi program" (slug) gelir.
- Program sertifika kodu biçimi `PRP-YYYY-NNNNNN`. "Kurs tamamlandı" = o kursun `certificates` satırı vardır.
- Programın **tüm** `program_courses` satırları `S`, kredi, kayıt yazımı ve tamamlanma kontrolünde aynı kümeyi oluşturur (yayın durumuna göre filtre yok). Kurs yayında değilse ya da soru içeren final sınavı yoksa program satışa kapalıdır (`sellable = false`).
- `canAccessCourse`'taki Plus davranışına dokunma (kapsam dışı).
- Çalışma `/Users/mac/Documents/Xellence/profect-programs` worktree'sinde, `feat/course-programs` dalında yapılır; her görev sonunda commit. **Ana dizine (`/Users/mac/Documents/Xellence/profect`, `feat/blog-news` dalı) dokunma:** orada başka bir ajanın commit edilmemiş işi var.
- Veritabanı iki ajan arasında **paylaşılır** (aynı `.env`): migration yalnızca ek (idempotent) olmalı, mevcut tablo/satır silinmemeli; testler yalnızca kendi `e2e-prog-*` verisini oluşturup silmeli.
- Dev sunucusu **3100** portunda açılır (`npx next dev -p 3100`); uçtan uca betikler `BASE_URL=http://localhost:3100` ile çalışır. 3000 başka ajana ait olabilir.

## Review Focus

Spec'in ima ettiği ama görev testlerinin doğrudan hedeflemediği, kullanıcıyı en çok vuracak durumlar (her biri sahibi olan görevin testine eklenmiştir):

1. Plus ile `plus` kaynaklı kursu olan kullanıcı programı alınca o kurslar için **ödeme yapar** ve satın almadan sonra kayıt kaynağı `purchase` olur (Görev 5).
2. Sepette programın üyesi bir kurs ya da ortak kurslu iki program: kurs çift ödenmez (`covered`), ikinci programın düşümü birinciyi sayar (Görev 1 + 3).
3. Son kursun sertifikası için iki eşzamanlı istek: tek program sertifikası ve tek üyelik satırı (Görev 4).
4. Program kursu sonradan yayından kalkar / final sınavı silinir: program sepete eklenemez ve hediye edilemez, mevcut üyenin erişimi ve sertifikası bozulmaz (Görev 3 + 6).
5. Hediyede alıcı bazı kurslara zaten sahip: alma başarılı olur ve fiyat değişmez; alıcı zaten üyeyse hediye `pending` kalır (Görev 6).

---

## File Structure

| Dosya | Sorumluluk |
|---|---|
| `src/lib/program-pricing.ts` (yeni) | Saf: program fiyatı, kredi, sıralı çoklu program fiyatlaması |
| `src/lib/program-rules.ts` (yeni) | Saf: tamamlanma kararı, sertifika kodu, yayın/satış sorunları |
| `src/lib/programs.ts` (yeni, `server-only`) | Program okuma, sahiplik, kayıt yazımı, `ensureProgramProgress` |
| `db/migrations/018_programs.sql` (yeni) | Şema |
| `src/lib/cart.ts`, `checkout-schema.ts`, `cart-quote.ts` | Sepette `program` kalemi ve fiyat teklifi |
| `src/lib/orders.ts`, `lms.ts` (`fulfillOrder`) | Program kalemi siparişi ve teslimi |
| `src/lib/gifts.ts`, `gift-rules.ts`, `mail.ts` | Program hediyesi |
| `src/app/api/programs/join/route.ts` (yeni) | Ücretsiz katılım |
| `src/app/programlar/**`, `src/app/hesabim/programlarim/page.tsx`, `src/components/Program*.tsx` | Herkese açık ve hesap arayüzü |
| `src/app/admin/programlar/**`, `src/app/api/admin/programs/**`, `src/components/admin/ProgramBuilder.tsx` | Yönetim |
| `scripts/test-programs.mjs` (yeni) | Uçtan uca doğrulama |

---

### Task 1: Saf mantık — fiyat ve kurallar

**Files:**
- Create: `src/lib/program-pricing.ts`, `src/lib/program-pricing.test.ts`, `src/lib/program-rules.ts`, `src/lib/program-rules.test.ts`

**Interfaces:**
- Produces:
  - `type ProgramCourseInput = { id: number; price: number }`
  - `type ProgramPriceLine = { id: number; listPrice: number; price: number; owned: boolean }` (`price` = `round2(listPrice × r)`)
  - `type ProgramQuoteCalc = { listTotal: number; programPrice: number; effectivePrice: number; ratio: number; credit: number; payable: number; ownedCount: number; lines: ProgramPriceLine[] }`
  - `priceProgram(programPrice: number, courses: readonly ProgramCourseInput[], ownedIds: ReadonlySet<number>): ProgramQuoteCalc`
  - `priceProgramsInOrder(programs: readonly { price: number; courses: readonly ProgramCourseInput[] }[], ownedIds: ReadonlySet<number>): ProgramQuoteCalc[]` — her program, öncekilerin kurslarını edinilmiş sayarak fiyatlanır
  - `isProgramComplete(courseIds: readonly number[], certifiedCourseIds: ReadonlySet<number>): boolean` (boş liste `false`)
  - `generateProgramCertificateCode(year?: number, rand?: () => number): string`
  - `type CourseEligibility = { id: number; title: string; price: number; is_published: boolean; has_final_quiz: boolean }`
  - `courseProblems(courses: readonly CourseEligibility[]): string[]`, `priceProblem(programPrice: number, courses: readonly CourseEligibility[]): string | null`

- [ ] **Step 1: `program-pricing.test.ts` yaz** (hepsi `node:test` + `assert/strict`):
  - `priceProgram` kullanıcının örneği: B=8000, 10 kurs × 1000, ilk 8'i edinilmiş → `ratio 0.8`, `credit 6400`, `payable 1600`, `listTotal 10000`, edinilmemiş kurs satırı `price 800`.
  - Hiçbiri edinilmemiş → `credit 0`, `payable 8000`; hepsi edinilmiş → `payable 0`, `credit 8000`.
  - Farklı fiyatlar: kurslar 1000/2000/3000, B=4800, 2000'lik edinilmiş → `ratio 0.8`, `credit 1600`, `payable 3200`.
  - `B > S`: kurslar 2000/3000, B=7000 → `effectivePrice 5000`; hiçbiri edinilmemişken `payable 5000`; 2000'lik edinilmişken `payable 3000`.
  - `S = 0` (iki ücretsiz kurs, B=500) → `ratio 1`, `effectivePrice 0`, `payable 0`.
  - Kuruş: 100/100/100, B=100, biri edinilmiş → `credit 33.33`, `payable 66.67`.
  - Değişmezler: sabit bir tablo (en az 12 B/fiyat/edinilmiş kombinasyonu) için `0 ≤ payable ≤ effectivePrice` ve `payable ≤ edinilmemiş liste toplamı`.
  - `priceProgramsInOrder`: P1 = kurs {1,2}, P2 = kurs {2,3}, hepsi 1000, B1=B2=1600, hiçbiri edinilmemiş → P1 `payable 1600`; P2'de kurs 2 edinilmiş sayılır → `credit 800`, `payable 800`.
- [ ] **Step 2: `program-rules.test.ts` yaz:** `isProgramComplete([1,2], Set{1,2,3})` true; `Set{1}` false; `[]` her zaman false. `generateProgramCertificateCode(2026, () => 0.5)` = `"PRP-2026-500000"`. `courseProblems`: yayında olmayan kurs → mesajda kurs adı geçer; final sınavı olmayan → mesajda kurs adı geçer; boş liste → "Programda en az bir kurs olmalı."; hepsi uygunsa `[]`. `priceProblem(7000, [2000, 3000 kurs])` mesaj döner, `priceProblem(5000, …)` ve daha düşüğü `null`.
- [ ] **Step 3: Testlerin başarısız olduğunu doğrula**
  Run: `node --experimental-strip-types --disable-warning=ExperimentalWarning --test src/lib/program-pricing.test.ts src/lib/program-rules.test.ts`
  Expected: FAIL (modüller yok).
- [ ] **Step 4: `program-pricing.ts` yaz.** `round2 = (n) => Math.round(n * 100) / 100`. `payable = min(round2(effective − credit), round2(Σ edinilmemiş liste))`, `0` altına inmez. `lines[i].price = round2(listPrice × ratio)`. `S = 0` ise `ratio = 1`.
- [ ] **Step 5: `program-rules.ts` yaz.** Mesajlar tam olarak: `“${title}” kursu yayında değil.`, `“${title}” kursunun soru içeren bir final sınavı yok.`, `Programda en az bir kurs olmalı.`, `Program fiyatı (${B}) kursların toplamından (${S}) yüksek olamaz.` Kod üretimi `generateCertificateCode` (`lms.ts`) ile aynı kalıp: `Math.floor(rand() * 1_000_000)` 6 haneye sıfırla doldurulur.
- [ ] **Step 6: Testlerin geçtiğini doğrula** (aynı komut). Expected: PASS.
- [ ] **Step 7: Commit** — `git add src/lib/program-*.ts src/lib/program-*.test.ts && git commit -m "feat(programs): pure pricing and rules"`

---

### Task 2: Migration ve veri katmanı

**Files:**
- Create: `db/migrations/018_programs.sql`, `src/lib/programs.ts`, `scripts/test-programs.mjs`
- Modify: `package.json` (script `test:programs`)

**Interfaces:**
- Consumes: `priceProgram`, `courseProblems` (Görev 1).
- Produces (`src/lib/programs.ts`, `server-only`):
  - `type ProgramRow = { id: number; slug: string; code: string; title: string; description: string; category: string; thumbnail_url: string | null; price: number; is_published: boolean; sort_order: number }`
  - `type ProgramCourse = { id: number; slug: string; title: string; hours: number; price: number; thumbnail_url: string | null; is_published: boolean; has_final_quiz: boolean; sort_order: number }`
  - `getProgramBySlug(slug: string, opts?: { includeDraft?: boolean }): Promise<ProgramRow | null>`, `getProgramById(id: number): Promise<ProgramRow | null>`
  - `listPublishedPrograms(): Promise<(ProgramRow & { course_count: number; list_total: number; hours: number })[]>`
  - `listProgramCourses(programId: number): Promise<ProgramCourse[]>` (`sort_order` sırasıyla, **tüm** üyeler)
  - `listOwnedCourseIds(userId: number): Promise<Set<number>>` (`source <> 'plus'`)
  - `isProgramMember(userId: number, programId: number): Promise<boolean>`
  - `type ProgramOffer = { program: ProgramRow; courses: ProgramCourse[]; calc: ProgramQuoteCalc; sellable: boolean; problems: string[]; member: boolean }`
  - `getProgramOffer(slug: string, userId: number | null, opts?: { includeDraft?: boolean }): Promise<ProgramOffer | null>` (`calc` giriş yoksa edinilmiş küme boşla; `sellable = courseProblems(...).length === 0`)
  - `grantCourseEnrollment(conn: Queryable, userId: number, courseId: number, source: "purchase" | "gift"): Promise<void>` — kayıt yoksa ekler, `source='plus'` ise verilen kaynağa yükseltir, diğer kaynaklara dokunmaz (`ON DUPLICATE KEY UPDATE`)
  - `enrollInProgram(conn: Queryable, userId: number, programId: number, source: "purchase" | "gift" | "auto"): Promise<boolean>` — üyelik satırını `INSERT IGNORE` eder; yeniyse (affectedRows 1) programdaki **tüm** kurslara `grantCourseEnrollment` (`auto` için kurs yazılmaz) yapar ve `true` döner; zaten üyeyse hiçbir şey yazmaz, `false` döner
  - `type Queryable = Pick<PoolConnection, "query" | "execute">` (pool da uyar)

- [ ] **Step 1: Migration yaz.** Spec "Veri (migration 018)" bölümündeki tablolar ve değişiklikler: `programs`, `program_courses` (PK `program_id,course_id`; FK'ler `ON DELETE CASCADE` program tarafında, `RESTRICT` kurs tarafında), `program_enrollments` (UNIQUE `user_id,program_id`), `program_certificates` (UNIQUE `user_id,program_id` ve `certificate_code`), `order_items.item_type` ENUM'una `'program'` + `program_id` (FK `SET NULL`), `gifts.course_id` NULL'lanır + `program_id` (FK `RESTRICT`) + `CHECK ((course_id IS NULL) <> (program_id IS NULL))`. `IF NOT EXISTS` desenini koru.
- [ ] **Step 2: Migration'ı uygula.**
  Run: `npm run db:migrate`
  Expected: hata yok; ikinci çalıştırmada da hata yok (yeniden çalıştırılabilir).
- [ ] **Step 3: `programs.ts`'i yaz.** `has_final_quiz` = `module_id IS NULL` bir quiz ve en az bir `type <> 'scenario'` sorusu (`lms.ts`'teki `QUIZ_TOTAL_SQL` tanımıyla tutarlı). Okuma sorguları `lms.ts` stilinde.
- [ ] **Step 4: `scripts/test-programs.mjs` iskeletini yaz** (`scripts/test-gifts.mjs`'in yardımcılarını — `api`, `page`, `addUser`, `cookieFor`, `check`, temizlik — kopyalayarak): `e2e-prog-<stamp>` önekli 5 kurs (her birine `module_id NULL` final quiz + 1 soru; fiyat 1000), 1 program (B=4000, 5 kurs, yayında), kullanıcılar, sonda hepsini silen temizlik. `package.json`'a `"test:programs": "node --env-file=.env --experimental-strip-types --disable-warning=ExperimentalWarning scripts/test-programs.mjs"` ekle. İskelet yalnızca seed + temizliği çalıştırır ve "seed ok" kontrolünü basar.
- [ ] **Step 5: Doğrula.** Run: `npm run typecheck` → hatasız. Run (dev sunucusu açıkken): `npm run test:programs` → "seed ok", kalıntı veri yok.
- [ ] **Step 6: Commit** — `git commit -m "feat(programs): schema and data layer"`

---

### Task 3: Sepet ve fiyat teklifi

**Files:**
- Modify: `src/lib/cart.ts`, `src/lib/checkout-schema.ts`, `src/lib/checkout-schema.test.ts`, `src/lib/cart-quote.ts`, `src/components/checkout/CartLines.tsx`, `scripts/test-programs.mjs`

**Interfaces:**
- Consumes: `getProgramOffer`, `listOwnedCourseIds`, `priceProgramsInOrder` (Görev 1–2).
- Produces:
  - `CartItem` birliğine `{ type: "program"; slug: string }` eklenir (`parse`, `sameItem`, `addToCart` bunu tanır; `CART_MAX_ITEMS` aynı kalır).
  - `cartItemsSchema` `program` kalemini kabul eder.
  - `QuoteLine` genişler: `status: "ok" | "owned" | "unavailable" | "join" | "covered"`, `programId: number | null`, `children?: { title: string; listPrice: number; price: number; owned: boolean }[]`. Anlamlar: `owned` = kullanıcı zaten program üyesi; `join` = üye değil ama `payable = 0` (ücretsiz katılım, ödenmez); `covered` = sepette zaten programı olan bir kurs (ödenmez); `unavailable` = program yok / satışa kapalı.
  - Program satırı: `key = "program:<slug>"`, `price = calc.payable`, `oldPrice = calc.programPrice`, `courseId = null`. Program satırları sepet sırasıyla `priceProgramsInOrder` ile fiyatlanır; `ownedIds` girişsizde boş küme. `Quote.payable` yalnızca `status === "ok"` satırlar; `total` onların toplamı.

- [ ] **Step 1: Test yaz** (`checkout-schema.test.ts`): `cartItemsSchema.safeParse([{ type: "program", slug: "x" }]).success === true`; `slug` yok ya da boş → `false`.
- [ ] **Step 2: Testi çalıştır, başarısızlığı gör.** Run: `node --experimental-strip-types --disable-warning=ExperimentalWarning --test src/lib/checkout-schema.test.ts` → FAIL.
- [ ] **Step 3: `cartItemsSchema`, `CartItem`, `parse`, `sameItem`'i genişlet;** testi çalıştır → PASS.
- [ ] **Step 4: `quoteCart`'ı genişlet.** Program satırları için `getProgramOffer`; sepetteki bir programın üyesi olan kurs satırları `covered`; Plus'lı kullanıcının kurs satırlarındaki mevcut `owned = plus` kısayolu **sadece kurs satırları için** kalır, program fiyatı `listOwnedCourseIds` ile hesaplanır.
- [ ] **Step 5: `CartLines.tsx`'i onaylı taslağa göre güncelle:** program tek kart; başlık, "5 kurs · tamamlayınca program sertifikası", sağda fiyat ve üstü çizili `oldPrice`; altında kurs kurs liste — edinilmiş olanlar üstü çizili + "Zaten sende", diğerleri indirimli fiyatla; `covered` ve `join` için kısa not (buton Görev 5'te). `NOTE` haritasına yeni durumlar eklenir.
- [ ] **Step 6: `test-programs.mjs`'e `/api/cart/quote` kontrolleri ekle** (5 kurslu program, B=4000):
  - 3 kurs `source='purchase'` edinilmiş kullanıcı → program satırı `price 1600`, `oldPrice 4000`, `children` 5 adet, 3'ü `owned`.
  - Girişsiz → `price 4000`, hiçbir çocuk `owned` değil.
  - Aynı sepette programın üyesi bir kurs → o kurs satırı `status "covered"`, toplam değişmez.
  - İki programın ortak kursu (ikinci program seed'i) → ikinci programın `price`'ı birincinin kursunu edinilmiş sayar.
  - 5 kursun hepsi edinilmiş, üye değil → `status "join"`, `price 0`, `total` içinde değil.
  - Kurslardan biri yayından kalkar (SQL ile) → `status "unavailable"`; geri alınır.
  - 3 kurs `source='plus'` + aktif `plus_until` → kredi **yok**, `price 4000`.
- [ ] **Step 7: Doğrula.** `npm run typecheck`; `npm run test:programs` → yeni kontroller ✓; tarayıcıda `/sepet` ile kartı gözle kontrol et (programı `localStorage` `profect_cart_v1` içine `{"type":"program","slug":"…"}` ekleyerek).
- [ ] **Step 8: Commit** — `git commit -m "feat(programs): cart item and personalised quote"`

---

### Task 4: Üyelik ve program sertifikası

**Files:**
- Modify: `src/lib/programs.ts`, `src/lib/lms.ts` (`CertificateRow`, `getCertificateByCode`, `listMyCertificates`), `src/lib/certificate-pdf.ts`, `src/app/sertifika/[code]/page.tsx`, `src/app/api/public/certificates/[code]/route.ts`, `src/app/api/client/certificates/generate/route.ts`, `src/app/hesabim/sertifikalarim/page.tsx`, `scripts/test-programs.mjs`

**Interfaces:**
- Consumes: `isProgramComplete`, `generateProgramCertificateCode` (Görev 1); `enrollInProgram` (Görev 2).
- Produces:
  - `ensureProgramProgress(userId: number, opts?: { courseId?: number; programId?: number }): Promise<{ issued: string[] }>` (`programs.ts`). Adaylar: `programId` verilirse o program; `courseId` verilirse o kursu içeren programlardan yayında olanlar ya da kullanıcının üye olduğu; ikisi de yoksa kullanıcının en az bir kursunun sertifikası olduğu yayındaki programlar. Her aday için tüm kursların sertifikası varsa tek transaction'da `program_enrollments`'a (`auto`, yoksa) ve `program_certificates`'a ekler; `UNIQUE (user_id, program_id)` çakışması "zaten var" sayılır (çift sertifika yok); kod çakışmasında kod yeniden üretilir. Yeni verilen kodları döner. İdempotenttir.
  - `CertificateRow`'a `kind: "course" | "program"` ve `included_courses: string[]` eklenir; `getCertificateByCode` önce `certificates`, bulamazsa `program_certificates` tablosuna bakar (program için `course_title` = program adı, `course_minutes` = kursların toplam süresi, `instructor` = "", `score` = null).
  - `listMyCertificates` program sertifikalarını da döner (`kind` alanıyla).

- [ ] **Step 1: `test-programs.mjs`'e kontrolleri ekle (önce başarısız olacak):**
  - Kullanıcı 5 kursa `source='purchase'` sahip, her biri için `quiz_attempts` (`is_passed=1`) SQL ile eklenmiş. `POST /api/client/certificates/generate` ile 4 kursun sertifikasını al → `program_certificates` satırı **yok**; 5.'yi al → tam 1 `program_certificates` ve 1 `program_enrollments` (`auto`) satırı.
  - Aynı son isteği tekrar et → hâlâ 1 satır.
  - **Eşzamanlılık:** yeni kullanıcıda 4 kurs sertifikalı, 5.'yi `Promise.all` ile iki kez iste → tam 1 program sertifikası, tam 1 üyelik satırı, her iki yanıt 2xx.
  - **Plus:** `plus_until` gelecekte, hiç kaydı yok; 5 kursun final sınavı geçildi (SQL) ve `generate` çağrıldı → program sertifikası verildi.
  - `GET /sertifika/<program kodu>` 200 ve sayfa program adını içerir; `GET /api/public/certificates/<kod>/pdf` 200, `content-type: application/pdf`; `GET /api/public/certificates/<kod>` 200 ve `data.course_title` program adı.
  - `/hesabim/sertifikalarim` HTML'i program kodunu içerir.
  - **Satıştan kalkma:** program üyesi bir kullanıcının programdaki bir kursu SQL ile yayından kalkar → verilmiş program sertifikasının sayfası hâlâ 200, üyelik satırı duruyor, `ensureProgramProgress` ikinci bir sertifika üretmiyor; kurs geri yayına alınır.
- [ ] **Step 2: Çalıştır, başarısızlığı gör.** `npm run test:programs` → yeni kontroller ✗.
- [ ] **Step 3: `ensureProgramProgress`'i yaz** (yukarıdaki sözleşme). Tamamlanma kontrolü saf `isProgramComplete` ile.
- [ ] **Step 4: `generate` endpoint'ine bağla:** sertifika başarıyla eklendikten sonra **ve** "zaten mevcut" dalında `ensureProgramProgress(userId, { courseId })` çağrılır; hata `console.error` ile loglanır, kurs sertifikası yanıtını bozmaz. Yanıta eklemeli alan: `program_certificate_codes: string[]`.
- [ ] **Step 5: Sertifika okumasını genişlet:** `lms.ts` tipleri ve `getCertificateByCode`; `/api/public/certificates/[code]` rotasını doğrudan SQL yerine `getCertificateByCode` kullanır hale getir (yanıt şekli aynı kalsın); doğrulama sayfası ve `buildCertificatePdf` program için `included_courses` listesini ve doğru metni gösterir; `/hesabim/sertifikalarim` tablosuna program satırları (tür etiketiyle) eklenir.
- [ ] **Step 6: Doğrula.** `npm run typecheck`; `npm run test:programs` → hepsi ✓; PDF'i bir kez indirip gözle kontrol et.
- [ ] **Step 7: Commit** — `git commit -m "feat(programs): auto membership and program certificates"`

---

### Task 5: Satın alma, teslim ve ücretsiz katılım

**Files:**
- Modify: `src/lib/orders.ts`, `src/lib/lms.ts` (`fulfillOrder`), `src/app/api/checkout/route.ts`, `src/components/checkout/CartLines.tsx`, `scripts/test-programs.mjs`
- Create: `src/app/api/programs/join/route.ts`, `src/components/JoinProgramButton.tsx`

**Interfaces:**
- Consumes: `enrollInProgram`, `ensureProgramProgress`, `getProgramOffer` (Görev 2, 4); program `QuoteLine` (Görev 3).
- Produces:
  - `createCartOrder` program satırlarını `order_items`'a `item_type='program'`, `program_id`, `title`, `unit_price = ödenecek` olarak yazar; bekleyen sipariş eşleştirme anahtarı (`itemKey`/`lineKey`) program için `program:<id>`.
  - `fulfillOrder` kalem seçimi `program_id`'yi de okur; program kaleminde transaction içinde `enrollInProgram(conn, o.user_id, programId, "purchase")`, commit sonrası `after(() => ensureProgramProgress(userId, { programId }).catch(console.error))`. Hediye siparişleri (`activateGiftForOrder` dalı) bu satırları zaten atlar.
  - `POST /api/programs/join` — gövde `{ slug: string }`; `requireUser`; program yayında ve `sellable`, kullanıcı üye değil ve `calc.payable === 0` (tüm kurslar edinilmiş) değilse 409/400 benzeri hata (`fail`); aksi halde `enrollInProgram(pool, userId, programId, "auto")`, ardından `ensureProgramProgress`; yanıt `{ slug }`.
  - `JoinProgramButton({ slug }: { slug: string })` (client): endpoint'i çağırır, başarıda `router.refresh()`.

- [ ] **Step 1: `test-programs.mjs`'e satın alma kontrollerini ekle (önce başarısız):**
  - 3/5 kurs `purchase` edinilmiş kullanıcı programı sepetle `POST /api/checkout` ile sipariş eder (mock/manual sağlayıcıya göre; manual ise admin onayı): `orders.amount = 1600`, `order_items` satırı `item_type 'program'`, `program_id` dolu, `unit_price 1600`; ödeme sonrası 5 kursun tamamında `enrollments` var, yeni 2'si `source 'purchase'`; `program_enrollments.source 'purchase'`.
  - **Plus yükseltme:** 3 kursta `source='plus'` kaydı + aktif Plus olan kullanıcı programı alır → ödenen tutar `4000`, ardından o 3 kayıt `source 'purchase'`.
  - Aynı siparişi iki kez onayla → kayıt/üyelik satırı sayısı değişmez (idempotent).
  - Kullanıcı 5 kursu da bitirmiş/sertifikalı ve programı sonradan alıyor → ödeme sonrası program sertifikası verilmiş.
  - %100 kuponla program siparişi anında `paid`.
  - `POST /api/programs/join`: 5 kursun hepsi edinilmiş kullanıcı → 200, `program_enrollments.source 'auto'`, **sipariş satırı oluşmaz**; 3/5 edinilmiş kullanıcı → hata, üyelik yok; zaten üye → hata; girişsiz → 401.
  - İstemci fiyatı: `POST /api/checkout` gövdesine `price` eklense bile `orders.amount` sunucu hesabıdır (şema kabul etmez ya da yok sayar).
- [ ] **Step 2: Çalıştır, başarısızlığı gör.** `npm run test:programs`.
- [ ] **Step 3: `orders.ts` ve `fulfillOrder`'ı yaz** (yukarıdaki sözleşme). Eski tek kalemli sipariş geri dönüşü (`lines` türetimi) `program_id` alanını `null` taşır.
- [ ] **Step 4: Tami sepetinde** program kaleminin `subCategory`'si `"Program"` (`/api/checkout/route.ts`); kupon dağıtımı değişmez.
- [ ] **Step 5: `join` endpoint'ini ve `JoinProgramButton`'ı yaz;** `CartLines`'taki `join` satırına buton ekle.
- [ ] **Step 6: Doğrula.** `npm run typecheck`; `npm run test:programs` → hepsi ✓.
- [ ] **Step 7: Commit** — `git commit -m "feat(programs): purchase, fulfilment and free join"`

---

### Task 6: Program hediyesi

**Files:**
- Modify: `src/lib/gifts.ts`, `src/lib/gift-rules.ts`, `src/lib/gift-rules.test.ts`, `src/lib/mail.ts`, `src/app/api/gifts/checkout/route.ts`, `src/app/api/gifts/claim/route.ts`, `src/components/checkout/CheckoutForm.tsx`, `src/components/gifts/ClaimGiftButton.tsx`, `src/app/hediye/[token]/page.tsx`, `src/app/hesabim/hediyeler/page.tsx`, `scripts/test-programs.mjs`
- Create: `src/app/hediye-et/program/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getProgramOffer`, `enrollInProgram`, `grantCourseEnrollment`, `ensureProgramProgress` (Görev 2, 4).
- Produces:
  - `giftCheckoutSchema`'ya `kind: z.enum(["course", "program"]).default("course")`; `slug` kursun ya da programın slug'ı.
  - `createGiftOrder` girdisinde `courseId/courseTitle` yerine `target: { kind: "course"; courseId: number; title: string } | { kind: "program"; programId: number; title: string }`; program için sipariş `plan='cart'`, tek `order_items` satırı `item_type='program'`, `unit_price = B'`; `gifts.program_id` dolu, `course_id` NULL.
  - `GiftView` ve `SenderGift` kurs-özel alanlar yerine `kind`, `itemSlug`, `itemTitle` taşır (`findGiftByToken`, `listGiftsForSender`, `sendGiftEmails` sorguları `courses`/`programs` için `LEFT JOIN` + `COALESCE` kullanır).
  - `claimGift(token, userId)` sonucu `{ ok: true; kind: "course" | "program"; slug: string } | { ok: false; reason }`; `/api/gifts/claim` yanıtı `{ kind, slug }`.
  - Program hediyesinde `alreadyOwns` = kullanıcı zaten **program üyesi**; kurs sahipliği engel değildir.
  - Mailler program için "kursunu" yerine "programını" der (`sendGiftRecipientEmail`/`sendGiftSenderEmail`'e `kind` parametresi).

- [ ] **Step 1: `gift-rules.test.ts`'e test ekle:** `giftCheckoutSchema` `kind` verilmediğinde `"course"` varsayar, `kind: "program"` kabul eder, `kind: "x"` reddeder.
- [ ] **Step 2: Testi çalıştır → FAIL; şemayı genişlet → PASS** (`node --experimental-strip-types … --test src/lib/gift-rules.test.ts`).
- [ ] **Step 3: `test-programs.mjs`'e hediye kontrollerini ekle (önce başarısız):**
  - Gönderen programı hediye eder: ödenen/`orders.amount` = `4000` (gönderen bazı kurslara sahip olsa bile); `gifts.program_id` dolu, `course_id` NULL; siparişte gönderene kurs/üyelik yazılmaz.
  - Alıcı (bazı kurslara zaten sahip, `plus` kaynaklı bir kayıt dahil) hediyeyi alır → 200; 5 kursun hepsi kayıtlı, `plus` olan `source 'gift'`'e yükselmiş, önceden `purchase` olan aynen kalmış; `program_enrollments.source 'gift'`; hediye `claimed`, `token_hash` NULL.
  - Alıcı zaten üye → hata, hediye `pending` kalır.
  - Yanlış hesap / doğrulanmamış hesap → mevcut kurs hediyesiyle aynı hata kodları.
  - Satışa kapalı program (bir kurs yayından kalktı) → `POST /api/gifts/checkout` 4xx.
  - Alıcı tüm kurslarını önceden bitirmişse alma sonrası program sertifikası verilir.
- [ ] **Step 4: Çalıştır, başarısızlığı gör.**
- [ ] **Step 5: Gift katmanını genişlet** (yukarıdaki sözleşmeler). `claimGift` program dalı aynı transaction içinde: kilitli satır → `claimBlock` → her kurs için `grantCourseEnrollment(conn, …, "gift")` → `enrollInProgram(conn, …, "gift")` (üyelik yeni değilse `already_owned`, rollback) → `gifts` güncelle → commit → `ensureProgramProgress(userId, { programId })`. Gönderen kendine hediye ve saatlik limit kuralları aynen geçerlidir.
- [ ] **Step 6: Arayüzü uyarla:** `CheckoutForm` hediye modunda `kind` taşır ve doğru API'ye gider; `/hediye-et/program/[slug]` sayfası `/hediye-et/[slug]` sayfasının programa uyarlanmışıdır (giriş yönlendirmesi dahil); `/hediye/[token]` ve `/hesabim/hediyeler` kurs yerine `itemTitle` gösterir ve alma sonrası `kind`'a göre `/ogrenim/<slug>` ya da `/programlar/<slug>`'a yönlendirir.
- [ ] **Step 7: Doğrula.** `npm run typecheck`; `npm test`; `npm run test:programs`; mevcut `npm run test:gifts` hâlâ geçiyor (regresyon).
- [ ] **Step 8: Commit** — `git commit -m "feat(programs): gifting programs"`

---

### Task 7: Herkese açık ve hesap arayüzü

**Files:**
- Create: `src/app/programlar/page.tsx`, `src/app/programlar/[slug]/page.tsx`, `src/components/ProgramCard.tsx`, `src/components/ProgramPricePanel.tsx`, `src/app/hesabim/programlarim/page.tsx`
- Modify: `src/components/account/items.ts` (menü öğesi), `src/components/Nav.tsx` ve `src/app/kurslar/page.tsx` (`/programlar` bağlantısı), `src/app/kurslar/[slug]/page.tsx` ve `src/app/ogrenim/[slug]/page.tsx` ("Bu kurs X programının parçası"), `src/lib/programs.ts`, `scripts/test-programs.mjs`

**Interfaces:**
- Consumes: `getProgramOffer`, `listPublishedPrograms`, `ensureProgramProgress` (Görev 2, 4); `JoinProgramButton` (Görev 5).
- Produces (`programs.ts`):
  - `listProgramsForCourse(courseId: number): Promise<{ slug: string; title: string }[]>` (yayındaki programlar)
  - `type MyProgram = { program: ProgramRow; courses: { id: number; slug: string; title: string; percentage: number; certificate_code: string | null }[]; completed: number; total: number; certificate_code: string | null }`
  - `listMyPrograms(userId: number): Promise<MyProgram[]>` (üye olunan programlar)
  - `ProgramPricePanel` (client) — props: `slug`, `loggedIn`, `member`, `sellable`, `payable`, `programPrice`, `listTotal`, `ownedCount`, `ownedCredit`; durumlar: üye → "Programa git"/ilerleme; `payable === 0` ve üye değil → `JoinProgramButton`; satışa kapalı → "Şu an satışta değil"; diğer → "Hemen Satın Al", "Sepete Ekle" (`addToCart({ type: "program", slug })`), "Hediye Et" (`/hediye-et/program/<slug>`; girişsizse `/giris?next=…`).

- [ ] **Step 1: İlgili Next.js kılavuzunu oku** (`node_modules/next/dist/docs/01-app`: sayfalar, dinamik rotalar, `generateMetadata`); mevcut `src/app/kurslar/[slug]/page.tsx` desenini izle.
- [ ] **Step 2: `/programlar/[slug]` sayfasını onaylı taslağa göre yaz:** başlık/etiketler; yol haritası (kurs kurs, sıra numarasıyla, "Önerilen sıra, zorunlu değil" notu); her satırda edinilmişse "Sende · %ilerleme / tamamlandı" (tamamlandı = kurs sertifikası var), değilse indirimli fiyat + üstü çizili liste fiyatı; fiyat kutusu: "Ayrı ayrı alsan" (`listTotal`), "Program fiyatı" (`effectivePrice`), "Sahip olduğun N kurs" (−`credit`, yalnızca `ownedCount > 0`), "Ödeyeceğin tutar" (`payable`). Giriş yoksa hiçbir kurs "sende" gösterilmez. Taslak programlar yalnızca admin için (`includeDraft`). Kişiye özel fiyat nedeniyle sayfa dinamik render edilir (önbelleğe alınmaz).
- [ ] **Step 3: `/programlar` listesi** (`ProgramCard`: ad, kurs sayısı, saat, `listTotal` üstü çizili + program fiyatı; girişliyse kişiye özel `payable`), `Nav` ve `/kurslar` başlığından bağlantı.
- [ ] **Step 4: `/hesabim/programlarim`:** sayfa açılışında `ensureProgramProgress(user.id)` (tembel geriye dönük üretim), ardından `listMyPrograms`; kurs bazlı ilerleme "3/5 kurs", varsa program sertifikası bağlantısı; menüye "Programlarım" eklenir.
- [ ] **Step 5: Kurs sayfalarına** (`/kurslar/[slug]` ve `/ogrenim/[slug]`) kurs bir ya da daha fazla yayındaki programın parçasıysa küçük "Bu kurs X programının parçası" bağlantısı.
- [ ] **Step 6: `test-programs.mjs`'e sayfa kontrolleri ekle:** `GET /programlar` 200 ve program adını içerir; `GET /programlar/<slug>` girişsiz "4.000" ve 5 kurs adını içerir; 3/5 edinilmiş kullanıcının çerezi ile "1.600" ve "Sende" içerir; taslak programın sayfası 404; `/hesabim/programlarim` girişsiz `/giris`'e yönlenir, girişli 200.
- [ ] **Step 7: Doğrula.** `npm run typecheck`; `npm run test:programs`; `/programlar/<slug>` ve `/sepet` sayfalarını mobil genişlikte de tarayıcıda gözle kontrol et (taslakla uyumlu mu).
- [ ] **Step 8: Commit** — `git commit -m "feat(programs): public pages and account views"`

---

### Task 8: Yönetim

**Files:**
- Create: `src/app/admin/programlar/page.tsx`, `src/app/admin/programlar/[id]/page.tsx`, `src/components/admin/ProgramBuilder.tsx`, `src/app/api/admin/programs/route.ts`, `src/app/api/admin/programs/[programId]/route.ts`
- Modify: `src/lib/admin-schemas.ts`, `src/lib/admin-schemas.test.ts`, `src/components/admin/AdminTabs.tsx`, `scripts/test-programs.mjs`

**Interfaces:**
- Consumes: `courseProblems`, `priceProblem` (Görev 1); `getProgramById`, `listProgramCourses` (Görev 2).
- Produces:
  - `createProgramSchema` (`title`, `description`, `price`, `course_ids: number[]` en az 1/en çok 50, isteğe bağlı `slug`, `code`, `category`) ve `updateProgramSchema` (aynı alanların `partial`'ı + `is_published`, `sort_order`, `thumbnail_url`).
  - `POST /api/admin/programs` (taslak olarak oluşturur; `slug`/`code` `courses` rotasındaki desenle üretilir, `code` öneki `PRG-`), `GET /api/admin/programs` (liste), `GET|PATCH /api/admin/programs/[programId]`. `PATCH` `course_ids` verilirse `program_courses`'u verilen sırayla transaction içinde değiştirir. Kaydederken **her zaman** `priceProblem` kontrol edilir (`B > S` → 400); `is_published=true` yapılırken ayrıca `courseProblems` boş olmalı (aksi halde 400, mesajlar yanıtta). Rotalar `requireAdmin` kullanır.

- [ ] **Step 1: `admin-schemas.test.ts`'e test ekle:** geçerli `createProgramSchema` gövdesi kabul; `course_ids: []` reddedilir; negatif `price` reddedilir; `updateProgramSchema` kısmi gövdeyi kabul eder.
- [ ] **Step 2: Testi çalıştır → FAIL; şemaları yaz → PASS.**
- [ ] **Step 3: `test-programs.mjs`'e admin kontrolleri ekle (önce başarısız):** admin olmayan 403; admin program oluşturur (taslak); kurs listesinde yayında olmayan kurs varken yayına almak 400 ve mesajda kurs adı; final sınavı olmayan kurs → 400; `price` > kurs toplamı → 400 (taslakta da); düzeltilince yayına alınır; `course_ids` sırası değiştirilip kaydedilince `program_courses.sort_order` yeni sırayı yansıtır; `GET` listesi programı döner.
- [ ] **Step 4: API rotalarını yaz** (yukarıdaki sözleşme). Hata gövdeleri `fail(message, 400)` ile; mesajlar `program-rules` çıktısıdır.
- [ ] **Step 5: `ProgramBuilder` ve sayfaları yaz:** başlık/açıklama/kategori/fiyat/yayın alanları; kurs ekle-çıkar-sırala (dnd-kit, `CourseBuilder`'daki deseni izle); kurs seçici yalnızca yayındaki kursları önerir; `S` ve hesaplanan indirim yüzdesi (`(1 − B/S) × 100`) canlı gösterilir; `B > S` uyarısı kaydı engeller. Kapak: mevcut `CoverUploadField` bu rota için kolayca yeniden kullanılabiliyorsa kullan, yoksa v1'de kapaksız bırak (`thumbnail_url` NULL). `AdminTabs`'e "Programlar" sekmesi.
- [ ] **Step 6: Doğrula.** `npm run typecheck`; `npm test`; `npm run test:programs`; admin panelinde elle bir program oluştur-yayına al-sepete ekle akışını dene.
- [ ] **Step 7: Commit** — `git commit -m "feat(programs): admin management"`

---

### Task 9: Bütünleşik doğrulama

**Files:**
- Modify: yalnızca doğrulamanın ortaya çıkardığı düzeltmeler

- [ ] **Step 1: Tüm kontrolleri çalıştır:** `npm run typecheck`, `npm test`, `npm run build`, (dev sunucusu açıkken) `npm run test:programs`, `npm run test:gifts`, `npm run test:api` — hepsi hatasız.
- [ ] **Step 2: Elle uçtan uca (tarayıcı):** program oluştur → 3 kursu ayrı ayrı satın al → program sayfasında 3 kursun "Sende" ve kişiye özel fiyatı gör → sepete ekle (kart + üstü çizili kurslar) → öde → kalan 2 kursu bitir → program sertifikasının otomatik geldiğini, doğrulama sayfasını ve PDF'i gör. Ardından programı bir başkasına hediye et ve almayı dene.
- [ ] **Step 3: Spec kapsamını çapraz kontrol et** (`2026-11-02-course-programs-design.md`): hedefler, anti-hedefler ve "Builder'a bırakılanlar" dışında eksik madde kalmadığını doğrula; eksik varsa ilgili görevin testiyle birlikte tamamla.
- [ ] **Step 4: Commit** (varsa düzeltmeler) — `git commit -m "chore(programs): final verification fixes"`

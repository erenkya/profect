# Şirket Paneli: Program Kontenjanı ve Toplu Atama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Şirketler Uzmanlık Programı kontenjanı satın alabilsin/ana admin tanımlayabilsin, çalışanlara matris ekranından toplu (kurs + program) atama yapılabilsin, başlanmış eğitim geri alınırken yeni uyarı çıksın ve şirkete bağlı üyeler kendi kendilerine de satın alabilsin.

**Architecture:** Program kontenjanı, kurs kontenjanının paralel tablolarıdır (`company_program_allocations`, `company_program_assignments`); kurs tabloları ve sorguları değişmez. Atama/geri alma şirket satırını `FOR UPDATE` ile kilitleyen mevcut kalıpla çalışır; toplu atama her kutucuğu bu kilit altında sırayla işler ve kutucuk başına sonuç döner. Matris saf bir durum fonksiyonuyla (`assign-matrix.ts`) sürülen tek bir istemci bileşenidir.

**Tech Stack:** Next.js 16 (App Router, `AGENTS.md` uyarısına bak), React 19, MySQL (`mysql2`), zod, `node --test` (saf kurallar), `scripts/test-*.mjs` (uçtan uca, çalışan sunucu + gerçek DB).

**Spec:** `docs/superpowers/specs/2026-11-05-company-program-seats-design.md` (ek karar: bkz. Task 1, belgenin §4.7'si bu planla eklenir).

## Global Constraints

- `AGENTS.md`: Next.js sürümü bilinenden farklı. İlk kod yazmadan önce `node_modules/next/dist/docs/01-app/` altındaki Route Handlers, Server/Client Components rehberlerine bak; fark bulursan plana not düş.
- Destek e-postası **`info@profect.com.tr`**, tek bir sabitte (`SUPPORT_EMAIL`) tutulur; uyarı metinlerinde mailto bağlantısı olur.
- Başlanmış eğitim uyarısı başlığı **"Bu eğitim geri alınamaz, yalnızca silinebilir"**, onay düğmesi **"Yine de sil"**, vazgeç düğmesi "Vazgeç". Gövde: "{Ad} bu eğitime başlamış: {Eğitim}. Başlanmış bir eğitim geri alınamaz, yalnızca silinebilir. Silerseniz çalışanın erişimi kapanır ve bu eğitimin hakkı kaybolur; başka bir kişiye verilemez. Destek için info@profect.com.tr adresine e-posta gönderebilirsiniz."
- Program kontenjanı kurs kontenjanını **artırmaz**; iki havuz ayrıdır. Program birim fiyatı = programın satış fiyatı (kurs listesi toplamını aşamaz; `priceProgram(price, courses, new Set())` → `effectivePrice`); toplam = birim × adet, **sunucuda** DB'den hesaplanır; kupon yok. Ücretsiz ya da `sellable === false` program kontenjanı satın alınamaz.
- Toplu atama: istek başına en çok **500** kutucuk; kısmi başarı (başarısız kutucuk atlanır, diğerleri yazılır); isteğe bağlı tek son tarih yalnızca **kurs** kutucuklarına uygulanır; programa son tarih yok.
- Program geri alınırken `company` kaynaklı kurs kaydı, çalışanda hâlâ aktif başka bir şirket ataması (kurs ya da program) karşılıyorsa **silinmez**; satın alma/hediye/admin kaynaklı kayıtlar hiçbir zaman silinmez. İlerleme ve sertifika silinmez.
- Şirket yetkisi daima `requireCompanyAccess` (DB üyeliği); toplu atamada her `user_id` çağrılan şirketin **aktif** üyesi olmalı.
- Göç dosyası yalnızca ekleyici ve yeniden çalıştırılabilir (`CREATE TABLE IF NOT EXISTS`, ENUM'a ekleme). Numara **024** (023 başkasının).
- **Çalışma ağacında başkasının bitmemiş "son tarih / rapor" işi var:** `src/components/company/CompanyPanel.tsx`, `src/lib/company-seats.ts`, `src/app/api/company/[companyId]/assignments/route.ts`, `src/lib/lms.ts`, `src/components/PurchasePanel.tsx`, `src/app/kurslar/[slug]/page.tsx` ve `023_company_deadlines.sql`, `due-rules`, `progress-report`, `DueEditor`. Bunları **önce Read ile mevcut hâliyle oku**, üzerine düzenle, geri alma/bozma. `git add -A` ve `git add .` yasak.
- Projede commit yalnızca kullanıcı isterse atılır: plandaki "Checkpoint" adımları, kullanıcı commit istediyse açık yollarla commit'tir; aksi halde atla. Çalışma ağacında başkasının değişikliği olan dosyaları o iş commit'lenmeden stage'leme (kullanıcıya sor).
- Arayüz metinleri Türkçe; kod yorumları mevcut kod gibi Türkçe-İngilizce karışık, kısa.

## Review Focus

1. **Aynı son kontenjan iki yönetici tarafından aynı anda toplu uygulanırsa** tam bir atama başarılı olur, diğeri `no_free` döner (Task 7 testi).
2. **Başka şirketin üyesinin `user_id`'si toplu atamada gönderilirse** (BOLA) o kutucuk `not_member` ile reddedilir, başka şirkete yazılmaz, bilgi sızmaz (Task 7 testi).
3. **Program geri almada başka kaynaklı ya da başka atamayla karşılanan kurs erişimi silinmez** (Task 4 testi).
4. **Üye şirketin talebi beklerken kursu kendisi satın alırsa** talep panelde bayat görünmez, atama denemesi 409 `already_owned` döner, çökmez (Task 1 testi).
5. **Kursu olmayan, ücretsiz ya da yayında olmayan program** ne satın alınabilir ne atanabilir; **aynı kutucuk iki kez** ya da boş liste gönderilen toplu istek temiz hata/yinelemesiz sonuç verir (Task 2, 5, 7 testleri).

---

### Task 1: Üyeler kendi satın alabilsin (kısıtı kaldır)

Ürün sahibinin 2026-11-05 kararı: şirkete bağlı (onaylı) üyeler ve şirket adminleri hem şirketten talep edebilir **hem de** kendileri satın alabilir/hediye edebilir. Önceki "üye kendi parasıyla alamaz" kuralı kalkar.

**Files:**
- Modify: `src/lib/company.ts` (`memberPurchaseBlock` sil), `src/lib/company-rules.ts` (`MEMBER_PURCHASE_BLOCK_MESSAGE` sil)
- Modify: `src/app/api/checkout/route.ts`, `src/app/api/gifts/checkout/route.ts` (engel çağrısını kaldır)
- Modify: `src/app/hediye-et/[slug]/page.tsx` (üye yönlendirmesini kaldır)
- Modify: `src/components/PurchasePanel.tsx`, `src/components/CourseCardActions.tsx` (satın alma düğmeleri + "Şirketimden talep et" birlikte)
- Modify: `src/lib/company-panel.ts` (açık talepler sorgusu: kurs zaten edinilmişse hariç)
- Modify: `scripts/test-company.mjs` bölüm C (kısıt assertion'larını tersine çevir)
- Modify: `docs/superpowers/specs/2026-11-03-company-accounts-design.md` (§4.5, §5.3, §5.12'ye "2026-11-05'te değişti" notu), `docs/superpowers/specs/2026-11-05-company-program-seats-design.md` (§4.7 "Üyelerin bireysel satın alması" ekle)

**Interfaces:**
- Produces: `isActiveMember(userId)` kalır (kurs/kart UI'sı talep düğmesini göstermek için kullanır). `memberPurchaseBlock` ve `MEMBER_PURCHASE_BLOCK_MESSAGE` artık yoktur; başka task'lar bunlara dayanmaz.

- [ ] **Step 1: Önce `AGENTS.md`'nin istediği Next.js rehberlerine göz at** (Global Constraints'teki yol); `PurchasePanel`/`CourseCardActions` istemci bileşenleri olduğu için bir fark yoksa devam.
- [ ] **Step 2: `scripts/test-company.mjs` bölüm C'yi değiştir (failing test):** "aktif üye sepetten kurs alamaz" → `r.status === 201`; "aktif üye hediye satın alabilir" → 201; "şirket admini de bireysel satın alabilir" → 201; `MEMBER_PURCHASE_BLOCK_MESSAGE` import'unu kaldır. Yeni assertion: "kursu kendisi alan üyenin bekleyen talebi panel verisinde yok": üye talep eder, sonra `enrollments`'a `purchase` kaydı eklenir, `GET /sirket` HTML'inde (şirket admini çerezi) talep satırı görünmez ve talebi `assign` ile çözme `409 already_owned` döner.
- [ ] **Step 3: Çalıştır, başarısız olduğunu gör.** `MAIL_DRY_RUN=true npm run dev` (ayrı terminal) → `npm run test:company`. Beklenen: yeni assertion'lar FAIL (403 dönüyor).
- [ ] **Step 4: Engeli kaldır.** İki API route'tan `memberPurchaseBlock` bloklarını sil; `company.ts`/`company-rules.ts`'ten tanımları sil; `hediye-et` sayfasındaki `isActiveMember` yönlendirmesini sil. `getCompanyPanelData` açık talep sorgusuna `AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = r.user_id AND e.course_id = r.course_id)` ekle.
- [ ] **Step 5: UI.** `PurchasePanel`: `companyMember` iken de "Hemen Satın Al" + "Sepete Ekle" gösterilir, altına `RequestCourseButton` eklenir; "Hediye Et" artık `!companyMember` şartına bağlı değil. `CourseCardActions` aynı şekilde: üye için satın alma düğmeleri ve talep düğmesi birlikte (kart sıkışıksa talep düğmesi ikincil stilde).
- [ ] **Step 6: Çalıştır:** `npm run typecheck` temiz; `npm run test:company` tümü ✓.
- [ ] **Step 7: Spec notlarını güncelle** (yukarıdaki iki belge; 11-03 belgesinde eski maddelerin yanına "→ 2026-11-05: kaldırıldı, bkz. program kontenjanı belgesi §4.7").
- [ ] **Step 8: Checkpoint** (yalnızca kullanıcı commit istediyse; açık yollar, in-flight dosyaları hariç sor).

---

### Task 2: Saf kurallar ve metinler

**Files:**
- Modify: `src/lib/company-rules.ts`, Test: `src/lib/company-rules.test.ts`
- Create: `src/lib/assign-matrix.ts`, Test: `src/lib/assign-matrix.test.ts`
- Create: `src/lib/company-copy.ts`, Test: `src/lib/company-copy.test.ts`

**Interfaces (Produces, sonraki task'lar bunları kullanır):**
```ts
// company-rules.ts
export type ProgramAssignBlockReason = "not_member" | "burned" | "already_member" | "no_free" | "empty_program";
export function programAssignBlock(i: { free: number; member: "active" | "other"; burned: boolean; alreadyProgramMember: boolean; courseCount: number }): ProgramAssignBlockReason | null; // sıra: not_member → empty_program → burned → already_member → no_free
export const PROGRAM_ASSIGN_BLOCK_MESSAGES: Record<ProgramAssignBlockReason, string>;
export function releasableCourseIds(i: { programCourseIds: readonly number[]; companySourced: ReadonlySet<number>; coveredElsewhere: ReadonlySet<number> }): number[]; // companySourced ∩ programCourseIds − coveredElsewhere
export type BulkItem = { userId: number; courseId: number; programId?: undefined } | { userId: number; programId: number; courseId?: undefined };
export type BulkFailureReason = AssignBlockReason | ProgramAssignBlockReason | "invalid";
export type BulkResult = { item: BulkItem; ok: true } | { item: BulkItem; ok: false; reason: BulkFailureReason };
export function dedupeBulkItems(items: readonly BulkItem[]): BulkItem[];                 // aynı (user, tür, id) bir kez
export function summarizeBulk(results: readonly BulkResult[]): { assigned: number; failures: Extract<BulkResult, { ok: false }>[] };
export const BULK_MAX_ITEMS = 500;
export const programSeatOrderTitle: (title: string, quantity: number) => string;         // "{title} · {quantity} kişilik program kontenjanı"
// assign-matrix.ts
export type CellState = "open" | "checked" | "assigned" | "burned" | "owned" | "full";
export function cellState(i: { server?: "assigned" | "burned" | "owned"; checked: boolean; free: number; pendingInColumn: number }): CellState;
export const columnRemaining: (free: number, pendingInColumn: number) => number;
export const cellKey: (userId: number, columnKey: string) => string;                      // "1810:c:441"
// company-copy.ts
export const SUPPORT_EMAIL = "info@profect.com.tr";
export const RECLAIM_TITLE = "Bu eğitim geri alınamaz, yalnızca silinebilir";
export const RECLAIM_CONFIRM_LABEL = "Yine de sil";
export function startedReclaimText(i: { name: string; titles: readonly string[] }): string; // gövde; titles birden çoksa "A, B" (üye çıkarma)
```

- [ ] **Step 1: Testleri yaz (failing).** `company-rules.test.ts`: `programAssignBlock` her sebebi sırasıyla (örn. `member:"other"` → `"not_member"`; `courseCount:0` → `"empty_program"`; `alreadyProgramMember:true, free:5` → `"already_member"`; `free:0` → `"no_free"`; hepsi uygun → `null`). `releasableCourseIds({programCourseIds:[1,2,3], companySourced:new Set([1,2,9]), coveredElsewhere:new Set([2])})` → `[1]`. `dedupeBulkItems` iki aynı kutucuğu birleştirir, kurs 5 ile program 5'i ayrı sayar. `summarizeBulk` iki başarı + bir `no_free` → `{assigned:2, failures:[…1]}`. `programSeatOrderTitle("Satın Alma", 3)` → `"Satın Alma · 3 kişilik program kontenjanı"`. `assign-matrix.test.ts`: `cellState({server:"assigned",…})` → `"assigned"`; `{checked:true, free:0, pendingInColumn:1}` → `"checked"` (işaretli kalır, kaldırılabilir); `{checked:false, free:2, pendingInColumn:2}` → `"full"`; `{checked:false, free:2, pendingInColumn:1}` → `"open"`; sunucu durumu her zaman işaretten önce gelir. `company-copy.test.ts`: `startedReclaimText({name:"Ayşe", titles:["X"]})` `"Ayşe"`, `"X"`, `"geri alınamaz, yalnızca silinebilir"` ve `SUPPORT_EMAIL` içerir.
- [ ] **Step 2: Çalıştır:** `npm test` → import hatası/FAIL.
- [ ] **Step 3: Yukarıdaki imzalarla uygula.** `programAssignBlock` mevcut `assignBlock`'un kalıbını izler; `PROGRAM_ASSIGN_BLOCK_MESSAGES` metinleri Türkçe ("Bu kullanıcı bu programa zaten üye.", "Bu programın kursu yok; atanamaz." vb., `ASSIGN_BLOCK_MESSAGES` üslubunda).
- [ ] **Step 4: Çalıştır:** `npm test` → hepsi PASS; `npm run typecheck` temiz.
- [ ] **Step 5: Checkpoint.**

---

### Task 3: Göç ve program kontenjan veri katmanı

**Files:**
- Create: `db/migrations/024_company_program_seats.sql`
- Create: `src/lib/company-program-seats.ts`
- Modify: `src/lib/company-seats.ts` (yalnızca `lockCompany`'u `export` et), `src/lib/programs.ts` (`grantCourseEnrollment`/`enrollInProgram` kaynak tiplerine `"company"` ekle)

**Interfaces:**
- Consumes: `lockCompany(conn, companyId)` (export edilmiş), `enrollInProgram(conn, userId, programId, source)`, `ensureProgramProgress(userId, {programId})`, `programAssignBlock`.
- Produces:
```ts
export type ProgramSeatSummary = { programId: number; programTitle: string; slug: string; total: number; assigned: number; burned: number; free: number };
export function getProgramSeatSummaries(companyId: number): Promise<ProgramSeatSummary[]>;     // yalnızca kontenjanı olan programlar, ada göre
export function addProgramAllocation(i: { companyId: number; programId: number; delta: number; source: "purchase" | "admin"; orderId?: number; createdBy?: number }): Promise<{ ok: true } | { ok: false; reason: "zero" | "below_used" | "no_program" }>; // allocationBlock kuralı
export function assignProgramSeat(i: { companyId: number; programId: number; userId: number; assignedBy: number }): Promise<{ ok: true } | { ok: false; reason: ProgramAssignBlockReason }>;
```
`assignProgramSeat` tek transaction: şirketi kilitle → üyelik aktif mi → mevcut atama (`FOR UPDATE`) → `program_enrollments` var mı → programın kurs sayısı → `programAssignBlock` → `enrollInProgram(conn, userId, programId, "company")` (programdaki tüm kurslara `company` kaynaklı kayıt; başka kaynaklılara dokunmaz) → atama satırı yaz/yeniden aktif et → commit. Commit sonrası `ensureProgramProgress(userId, { programId })` çağrılır, hatası atamayı bozmaz (`.catch(console.error)`).

- [ ] **Step 1: Göç dosyasını yaz:** `company_program_allocations` (`company_allocations`'ın aynası: `program_id`, `quantity INT`, `source ENUM('purchase','admin')`, `order_id NULL UNIQUE`, `created_by`, FK'ler `programs` için `RESTRICT`), `company_program_assignments` (`company_assignments`'ın aynası, `due_at` yok, `UNIQUE (company_id, program_id, user_id)`), `ALTER TABLE program_enrollments MODIFY COLUMN source ENUM('purchase','gift','auto','admin','company') NOT NULL`, `ALTER TABLE order_items MODIFY COLUMN item_type ENUM('course','plus','program','seats','program_seats') NOT NULL`. Dosya başına 020/023 gibi Türkçe açıklama yorumu.
- [ ] **Step 2: Uygula:** `npm run db:migrate`. Beklenen: `✓ uygulandı 024_company_program_seats.sql`. Doğrula: `node --env-file=.env -e` ile `SHOW CREATE TABLE company_program_assignments` ve `SHOW COLUMNS FROM program_enrollments LIKE 'source'` çıktısında `'company'` var.
- [ ] **Step 3: `company-program-seats.ts`'yi yaz** (yukarıdaki imzalar; `getProgramSeatSummaries` kurs sürümünün aynı alt sorgu kalıbı). Not: bu dosyanın uçtan uca testi Task 9'daki betikte; burada `npm run typecheck` temiz olmalı.
- [ ] **Step 4: Hızlı doğrulama (geçici, kayıt bırakma):** tek seferlik `node --env-file=.env --experimental-strip-types` betiğiyle test şirketi/üyesi/programı DB'ye ekle, `addProgramAllocation` + `assignProgramSeat` çağır, `program_enrollments.source='company'` ve programdaki her kurs için `enrollments.source='company'` doğrula, sonra sil. (Kalıcı test Task 9.)
- [ ] **Step 5: Checkpoint.**

---

### Task 4: Program geri alma, üye çıkarma ve yeni uyarı

**Files:**
- Modify: `src/lib/company-program-seats.ts`, `src/lib/company-seats.ts` (`removeMember` program atamalarını da işlesin; `hasWatched` kalır)
- Create: `src/app/api/company/[companyId]/program-assignments/[assignmentId]/reclaim/route.ts`
- Modify: `src/app/api/company/[companyId]/assignments/[assignmentId]/reclaim/route.ts`, `src/app/api/company/[companyId]/members/[memberId]/route.ts` (409 mesajları `startedReclaimText`)
- Modify: `src/components/company/ReclaimDialog.tsx` (başlık/onay etiketi/mailto), `src/components/company/CompanyPanel.tsx` (mesajlar, etiketler)

**Interfaces:**
- Consumes: `releasableCourseIds`, `reclaimOutcome`, `canRemoveAdmin`, `startedReclaimText`, `SUPPORT_EMAIL`, `RECLAIM_TITLE`, `RECLAIM_CONFIRM_LABEL`.
- Produces:
```ts
export function hasWatchedProgram(conn: Queryable, userId: number, programId: number): Promise<boolean>; // programdaki HERHANGİ bir kurs için hasWatched
export type ProgramReclaimResult = { ok: true; outcome: "return" | "burn" } | { ok: false; reason: "not_found" | "needs_confirm"; programTitle?: string };
export function reclaimProgramSeat(i: { companyId: number; assignmentId: number; confirmBurn: boolean }): Promise<ProgramReclaimResult>;
// ReclaimDialog: mevcut prop'lar kalır; başlık sabit RECLAIM_TITLE; confirmLabel varsayılanı RECLAIM_CONFIRM_LABEL; gövdenin altında "Destek: <a href="mailto:info@profect.com.tr">".
```
Program ataması bitirilince (`return` ya da `burn`): atama `revoked`/`burned` + `ended_at`; `program_enrollments` satırı **yalnızca `source='company'` ise** silinir; programın kurslarındaki `source='company'` kurs kayıtlarından `releasableCourseIds` ile bulunanlar silinir (`coveredElsewhere` = aynı kullanıcının aktif `company_assignments` kurs ataması + başka aktif program atamalarının kursları). `removeMember` her aktif program ataması için de `reclaimOutcome(hasWatchedProgram(...))` uygular; `needs_confirm`'de eğitim listesi kurs başlıkları + program başlıklarıdır.

- [ ] **Step 1: Başarısız testi yaz (Task 9'daki betiğin bu kısmını şimdi ekle):** `scripts/test-company-programs.mjs` iskeletini `scripts/test-company.mjs` ilk ~60 satırının yardımcılarıyla (db, stamp, `api`, `addUser`, `cookieFor`, `addCompanyDb`) kur ve `npm run test:company-programs` script'ini `package.json`'a ekle. Bu task için senaryolar: (a) izlenmemiş program ataması geri alınır → hak havuza döner, `company` kaynaklı kurs kayıtları silinir, **ama** kullanıcının `purchase` kaynaklı kursu ve başka aktif `company_assignments` kurs ataması karşılayan kurs silinmez; (b) kursa başlamış (`lesson_progress` satırı) kullanıcıda ilk çağrı `409 needs_confirm` (mesajda `info@profect.com.tr` ve "yalnızca silinebilir"), `confirm_burn:true` ile `burned`, program sertifikası (`program_certificates`) silinmez; (c) üyeyi çıkar: başlamış program ataması varsa `needs_confirm` + `courseTitles` içinde program başlığı; onayla çıkarınca atama `burned`.
- [ ] **Step 2: Çalıştır:** `npm run test:company-programs` → FAIL (route/işlev yok).
- [ ] **Step 3: `hasWatchedProgram`, `reclaimProgramSeat`, `removeMember` genişletmesi, yeni route'u uygula.** Route, kurs reclaim route'unun aynı kalıbı (`requireCompanyAccess`, `parseId`, 409 `needs_confirm` gövdesi `{ reason, programTitle, message }`).
- [ ] **Step 4: Uyarı metinleri.** İki mevcut route'un 409 `message`'ı `startedReclaimText`'ten üretilir (eski "Bu eğitimin hakkı yeni bir kişiye verilemez…" cümleleri gider). `ReclaimDialog` başlık/etiket/mailto; `CompanyPanel`'de üç `setPending` yeri (`reclaim`, `removeMember`, ve Task 8'in program reclaim'i) `startedReclaimText` ile gövde kurar, `confirmLabel` varsayılana döner (`"Yine de çıkar"` etiketi de `"Yine de sil"` olur).
- [ ] **Step 5: Çalıştır:** `npm run test:company-programs` bu senaryolar ✓; `npm run test:company` ✓ (mevcut reclaim assertion'ları metne bağımlıysa güncelle); `npm run typecheck` temiz.
- [ ] **Step 6: Checkpoint.**

---

### Task 5: Program kontenjanı satın alma

**Files:**
- Modify: `src/lib/company-rules.ts` (`seatCheckoutSchema`'ya `kind`), `src/lib/orders.ts` (`createProgramSeatOrder`), `src/lib/lms.ts` (`fulfillOrder` dalı; **in-flight dosya, önce oku**), `src/app/api/company/[companyId]/checkout/route.ts`
- Create: `src/app/sirket/kontenjan-al/program/[slug]/page.tsx`
- Modify: `src/components/checkout/CheckoutForm.tsx` (`SeatsCheckout.kind`), `src/app/hesabim/siparislerim/[id]/page.tsx` (`ITEM_TYPE.program_seats`), `src/lib/lms.ts` `MyOrderItem`/`getMyOrderDetail` tipleri (`program_seats`; href programa)

**Interfaces:**
- Consumes: `getProgramOffer(slug, null)` (`calc.effectivePrice`, `sellable`, `program.price`), `programSeatOrderTitle`, `addProgramAllocation` mantığı (fulfill içinde `INSERT IGNORE INTO company_program_allocations … source='purchase', order_id`).
- Produces:
```ts
// company-rules.ts: seatCheckoutSchema = z.object({ kind: z.enum(["course","program"]).default("course"), slug, quantity, billing, consents, card? })
// orders.ts
export function createProgramSeatOrder(i: { userId: number; companyId: number; programId: number; title: string; quantity: number; total: number; billing: Billing; provider: string; ip: string }): Promise<number>; // order_items: item_type='program_seats', program_id, unit_price = SATIR TOPLAMI, quantity
// CheckoutForm: type SeatsCheckout = { …; kind?: "course" | "program" }  → body'ye kind gönderir; metinler "program kontenjanı"
```
`fulfillOrder`: `line.item_type === "program_seats" && line.program_id && o.company_id` → `company_program_allocations`'a `INSERT IGNORE` (`UNIQUE(order_id)` çift yazımı engeller); program kaydı **açılmaz**. `Line.item_type` birleşimine `"program_seats"` eklenir. Route: `kind==="program"` ise `getProgramOffer(slug, null)`; yoksa/yayında değilse 404; `!offer.sellable` ya da `effectivePrice <= 0` → 400 ("Bu program için kontenjan satın alınamaz."). `kind` verilmeyen eski istekler kurs gibi çalışır.

- [ ] **Step 1: Başarısız testleri yaz.** `company-rules.test.ts`: `seatCheckoutSchema.parse` `kind` yoksa `"course"` verir; `kind:"program"` kabul; `kind:"x"` reddedilir. `test-company-programs.mjs`: (a) mock ödeme modunda (`PAYMENT_MODE=mock`, `test-company.mjs`'in kontenjan satın alma bölümü nasıl kuruyorsa öyle) program kontenjanı siparişi 201 `paid`, `company_program_allocations` toplamı = adet, **kurs** kontenjan toplamı değişmez; (b) `price=0` program 400, yayında olmayan program 404, `sellable=false` (kursu olmayan) program 400; (c) başka şirketin yolundan program kontenjanı satın alma 403; (d) toplam = `effectivePrice × quantity` (istemci tutar gönderse de yok sayılır).
- [ ] **Step 2: Çalıştır:** `npm test` ve `npm run test:company-programs` → FAIL.
- [ ] **Step 3: Uygula** (imzalar yukarıda). `/sirket/kontenjan-al/program/[slug]/page.tsx` kurs sayfasının aynı kalıbı: `requireCompanyAdminPage`, program `notFound()` (yok/yayında değil/ücretsiz), `CheckoutForm seats={{ …, kind: "program", unitPrice: offer.calc.effectivePrice }}`. `CheckoutForm` metinleri ("Kontenjanı satın al", özet satırı) `kind` ile "program kontenjanı" der; iade bağlantısı `/sirket`. Sipariş detay sayfasında etiket "Program kontenjanı".
- [ ] **Step 4: Çalıştır:** testler ✓, `npm run typecheck` temiz, `npm run test:company` ✓ (kurs kontenjan akışı bozulmadı).
- [ ] **Step 5: Checkpoint.**

---

### Task 6: Ana admin program kontenjanı tanımı

**Files:**
- Modify: `src/app/api/company/[companyId]/allocations/route.ts`, `src/components/company/CompanyPanel.tsx` (platform kutusu; Task 8'de birleşir)

**Interfaces:**
- Produces: `POST /api/company/[id]/allocations` gövdesi `{ course_id, delta } | { program_id, delta }` (tam biri; ikisi ya da hiçbiri 400). Program için `addProgramAllocation({ …, source:"admin", createdBy })`; hata eşlemesi kursunkiyle aynı (`below_used` 409, `zero` 400, `no_program` 400 "Program bulunamadı.").

- [ ] **Step 1: Başarısız test (`test-company-programs.mjs`):** ana admin `program_id` ile +5 → 200; şirket admini aynı isteği atarsa 403; `course_id` ve `program_id` birlikte 400; atanan+yanan altına düşüren negatif delta 409; delta 0 400.
- [ ] **Step 2: Çalıştır** → FAIL.
- [ ] **Step 3: zod'u `z.union` ile genişlet** (`refine` ile tam biri), program dalını ekle. Panel platform kutusunun seçicisi Task 8'de programları da listeler; burada yalnızca API.
- [ ] **Step 4: Çalıştır:** testler ✓, `npm run typecheck` temiz.
- [ ] **Step 5: Checkpoint.**

---

### Task 7: Toplu atama (API + matris verisi)

**Files:**
- Create: `src/lib/company-bulk-assign.ts`, `src/app/api/company/[companyId]/assignments/bulk/route.ts`
- Modify: `src/lib/company-panel.ts` (matris verisi)

**Interfaces:**
- Consumes: `assignSeat` (kurs; `dueAt?` alır, in-flight), `assignProgramSeat`, `dedupeBulkItems`, `summarizeBulk`, `BULK_MAX_ITEMS`, `ASSIGN_BLOCK_MESSAGES`, `PROGRAM_ASSIGN_BLOCK_MESSAGES`, `dueInputSchema`/`dueBlock`/`DUE_PAST_MESSAGE` (`due-rules`).
- Produces:
```ts
// company-bulk-assign.ts
export function applyBulkAssignments(i: { companyId: number; actorId: number; items: readonly BulkItem[]; dueAt?: string | null }): Promise<BulkResult[]>;
// sırayla işler; her kutucuk assignSeat/assignProgramSeat'in kendi transaction+kilidiyle; beklenmeyen hata o kutucuğu {ok:false, reason:"invalid"} yapar (console.error), kalanlar sürer
// POST /api/company/[companyId]/assignments/bulk
//   body: { items: [{ user_id, course_id } | { user_id, program_id }] (1..500), due_at? }  → 200 { success:true, assigned:number, failed:[{ user_id, course_id?|program_id?, reason, message }] }
//   boş/500 üstü/biçimsiz → 400; guard requireCompanyAccess
// company-panel.ts
export type MatrixColumn = { key: string; kind: "course" | "program"; id: number; title: string; free: number };       // key: "c:441" | "p:12"
export type MatrixCellServer = "assigned" | "burned" | "owned";
export type AssignMatrixData = { columns: MatrixColumn[]; cells: Record<string, MatrixCellServer> };                    // cells anahtarı cellKey(userId, columnKey); eksik = açık
// CompanyPanelData ek alanları: programSeats: ProgramSeatSummary[]; matrix: AssignMatrixData; programs: { id: number; title: string; slug: string }[]  (satın alınabilir: yayında, satılabilir, ücretli)
```
Matris hücreleri: `assigned` = aktif şirket ataması (kurs ya da program), `burned` = yanmış, `owned` = kullanıcının o kursa (`enrollments`) / programa (`program_enrollments`) başka yoldan sahip olması (şirket ataması yoksa). Sütunlar: kontenjanı (`total > 0`) olan kurslar sonra programlar, kurslar ada göre.

- [ ] **Step 1: Başarısız testler.** `test-company-programs.mjs`: (a) 3 çalışan × (1 kurs + 1 program) tek istekte → `assigned:6`, her kayıt yazıldı; (b) kontenjan 2 iken 3 kişiye toplu kurs → `assigned:2`, `failed` 1 satırı `no_free` + Türkçe `message`; (c) aynı kutucuk iki kez gönderilir → tek atama, hata yok; boş `items` 400; 501 kutucuk 400; (d) **Review Focus 2:** şirket A admini, şirket B üyesinin `user_id`'sini gönderir → o kutucuk `not_member`, B'de hiçbir satır oluşmaz; B'nin yolundan (`/api/company/B/...`) istek 403; (e) **Review Focus 1:** son 1 kontenjan için aynı anda iki `Promise.all` toplu istek (farklı çalışanlar) → toplam `assigned` tam 1, öbürü `no_free`; (f) `due_at` verilince yalnızca kurs atamalarında `company_assignments.due_at` dolu, program kutucuğu etkilenmez; geçmiş tarih 400 (`DUE_PAST_MESSAGE`).
- [ ] **Step 2: Çalıştır** → FAIL.
- [ ] **Step 3: `applyBulkAssignments`, route'u ve `getCompanyPanelData` genişlemesini uygula.** Matris sorguları tek tek N+1 olmasın: şirketin aktif/yanmış atamaları, üyelerin `enrollments` ve `program_enrollments` satırları toplu çekilir.
- [ ] **Step 4: Çalıştır:** `npm run test:company-programs` ✓, `npm run test:company` ✓, `npm run typecheck` temiz.
- [ ] **Step 5: Checkpoint.**

---

### Task 8: Panel arayüzü (matris, program satırları, satın alma)

**Files:**
- Create: `src/components/company/AssignMatrix.tsx`
- Modify: `src/components/company/CompanyPanel.tsx` (**in-flight, önce oku**), `src/lib/company-panel.ts` (`programProgress`)
- Test: tarayıcıda elle + `npm run typecheck`

**Interfaces:**
- Consumes: `cellState`, `columnRemaining`, `cellKey`, `AssignMatrixData`, `adminApi` (`@/components/admin/api`), `summarizeBulk` biçimi (API cevabı), mevcut `DueEditor`/tarih girdisinin CompanyPanel'deki `assign()` dönüştürme yolu (Türkiye saati → UTC; yeniden kullan).
- Produces:
```tsx
export function AssignMatrix(props: { base: string; members: { userId: number; name: string }[]; matrix: AssignMatrixData; onDone: (r: { assigned: number; failed: { userName: string; title: string; message: string }[] }) => void }): JSX.Element;
// company-panel.ts: programProgress: { assignmentId: number; userId: number; userName: string; userEmail: string; programId: number; programTitle: string; completedCourses: number; totalCourses: number; status: ProgressStatus; certificateCode: string | null }[]
```
Davranış (spec §4.3–4.5): satırlar onaylı üyeler; sütunlar kurslar, sonra "Programlar" grup başlığıyla programlar; hücreler `cellState`'e göre: `open` kutu, `checked` işaretli, `assigned` "✔ atandı", `burned` "yandı", `owned` "zaten sahip", `full` kapalı kutu; alt satır **Kalan** `columnRemaining` ile canlı; sütun başlığında "Daha fazla al" (kurs: `/sirket/kontenjan-al/<slug>`, program: `/sirket/kontenjan-al/program/<slug>`); "N atamayı uygula" düğmesi (`N` işaretli sayısı, 0 iken kapalı) + isteğe bağlı tek son tarih alanı (yalnızca kurs hücreleri için olduğunu söyleyen yardım metniyle); uygulama sonucu toast + başarısız listesi ("Ayşe Demir · Müzakere: Kontenjan bitti"), başarısız hücreler işaretsiz, `router.refresh()`. İlk sütun sticky, yatay kaydırma, 375px genişlikte kullanılabilir. Eski satır içi "Çalışan seç + Ata" kontrolleri (`assignee`, `assign()`, ilgili `<select>`/`<input>`/"Ata") kaldırılır; Kontenjanlar tablosu program grubunu da gösterir (Toplam/Atanan/Boş/Yanan + "Daha fazla al"); "Yeni kontenjan al" seçicisi kurs ve program `<optgroup>`'u; platform "Kontenjan tanımla" seçicisi program optgroup'unu içerir ve `program_id` gönderir. "Çalışanlar ve ilerleme" tablosuna `programProgress` satırları "Program" etiketiyle eklenir (ilerleme "2/4 kurs", sertifika program kodu) ve "Kontenjanı geri al" `POST …/program-assignments/${id}/reclaim` çağırır; needs_confirm → `ReclaimDialog` (Task 4 metinleri).

- [ ] **Step 1: `getCompanyPanelData`'ya `programProgress` ekle** (kurs sayısı ve program sertifikası dahil; tek sorgu).
- [ ] **Step 2: `AssignMatrix.tsx`'i yaz** (yukarıdaki davranış; sunucu kısıtları ayrıca sunucuda zorlanır, istemci yalnızca kolaylık).
- [ ] **Step 3: `CompanyPanel.tsx`'i entegre et** (mevcut in-flight değişikliklerini koruyarak: `DueEditor`, son tarih kolonları, rapor indirme aynen kalır).
- [ ] **Step 4: `npm run typecheck` temiz.** Dev sunucusunda (`npm run dev`) `/sirket`'i demo şirket hesabıyla (`hesaplar.txt`) tarayıcıda aç; claude-in-chrome ile: matriste 2 çalışan × 1 kurs + 1 program işaretle, "Kalan" düşüşünü gör, uygula, "atandı" hücrelerini ve "Çalışanlar ve ilerleme"deki program satırını gör; başlamış çalışan için geri almada yeni uyarıyı gör (kopya metin, mailto). 375px genişlikte yatay kaydırma ve sticky sütun. Ekran görüntüsü al.
- [ ] **Step 5: Checkpoint.**

---

### Task 9: Uçtan uca doğrulama ve belge

**Files:**
- Modify: `scripts/test-company-programs.mjs` (kalan kapsam), `package.json` (`test:company-programs` Task 4'te eklendi), `docs/superpowers/specs/2026-11-05-company-program-seats-design.md` (durum "uygulandı", §4.7)

- [ ] **Step 1: Betikte henüz olmayan senaryoları tamamla:** program atama sonrası çalışanın `program_enrollments` ve tüm kurs kayıtları (`source='company'`); çalışan programın bir kursuna önceden `purchase` ile sahipse atama başarılı ve kaydın kaynağı `purchase` kalır; `already_member` ve `empty_program` (kursu olmayan program) atama reddi; **Review Focus 5**: ücretsiz/yayında olmayan program satın alma ve atama reddi; Task 1'in üye-satın-alma ve bayat-talep assertion'ları `test-company.mjs`'te; betik sonunda kendi oluşturduğu her şeyi (`e2e-company-programs-<damga>-*`) siler.
- [ ] **Step 2: Hepsini çalıştır** (`MAIL_DRY_RUN=true npm run dev` açıkken): `npm test`, `npm run typecheck`, `npm run test:company`, `npm run test:company-programs`, `npm run test:programs`, `npm run test:gifts`, `npm run test:api`. Beklenen: hepsi başarılı; başarısız olan varsa çıktısıyla raporla, "geçti" deme.
- [ ] **Step 3: Belgeyi güncelle** (durum + yapılan sapmalar varsa listele).
- [ ] **Step 4: Kullanıcıya rapor:** yapılanlar, çalıştırılan komutlar ve sonuçları, tarayıcıda görülenler, kapsam dışı kalanlar (spec §3), in-flight iş hakkında not.
- [ ] **Step 5: Checkpoint** (kullanıcı istediyse).

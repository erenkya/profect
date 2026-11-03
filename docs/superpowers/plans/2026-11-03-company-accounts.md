# Şirket Hesapları ve Kontenjan Sistemi Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kurumsal/bireysel kayıt, şirket kodu ve mail uzantısıyla katılma (onaylı), şirketlerin kurs kontenjanı alıp çalışanlara ataması/geri alması, şirket admini ve ana admin raporlarını eklemek.

**Architecture:** Şirket verisi yeni tablolarda tutulur (`companies`, `company_members`, `company_allocations`, `company_assignments`, `company_course_requests`, `company_signup_intents`). Atanan kontenjan normal bir `enrollments` satırı (`source='company'`) açar, böylece ilerleme/sertifika/erişim kodu değişmez. Tüm şirket API'leri tek yüzeyde (`/api/company/[companyId]/…`) durur; hem şirket admini hem ana admin aynı uçları ve aynı panel bileşenini kullanır. Saf kurallar `company-rules.ts`'te (node --test), DB işleri `company*.ts`'te, uçtan uca doğrulama `scripts/test-company.mjs`'te.

**Tech Stack:** Next.js (App Router, proxy.ts), React, MySQL (mysql2), zod, jose JWT, mevcut ödeme soyutlaması (`src/lib/payment`).

**Spec:** `docs/superpowers/specs/2026-11-03-company-accounts-design.md`

## Global Constraints

- Arayüz ve mesajlarda "koltuk/lisans" değil **"kontenjan"** yazılır; metinler Türkçe, kod yorumları mevcut gibi Türkçe.
- `AGENTS.md`: bu Next.js sürümü bilinenden farklı. Route handler, sayfa ve `proxy.ts` kodu yazmadan önce `node_modules/next/dist/docs/01-app/` altındaki ilgili rehberi oku; mevcut `[id]` route'ları (`src/app/api/admin/coupons/[couponId]/route.ts`) ve sayfaları (`params` bir `Promise`) örnek al.
- Fiyat daima sunucuda DB'den hesaplanır; kart verisi saklanmaz. `unit_price` sütunu **satır toplamı** tutar (kontenjan siparişinde `price × adet`), böylece makbuz ve sipariş detayı değişmez.
- JWT `role` değişmez (`user|admin|instructor`). Şirket yetkisi her istekte DB'den (`company_members`) okunur.
- Migrasyon numarası **020**, dosya `db/migrations/020_companies.sql`; mevcut stil (IF NOT EXISTS, Türkçe başlık yorumu).
- Saf kural dosyaları `server-only` içermez ve içe aktarmalarında `.ts` uzantısı kullanır (`gift-rules.ts` gibi), `npm test` ile çalışır.
- Bu planda e-posta bildirimi **yoktur** (katılım/talep sonuçları panelde görünür).
- Şirket kontenjan alımında kupon yoktur (hediye siparişi gibi); mevcut sepet kuponu aynen kalır.
- **`.env`'deki DB'nin geliştirme veritabanı olduğunu doğrulamadan `db:migrate` veya e2e script çalıştırma.**

## Review Focus

Spec'in ima edip hiçbir görevin açıkça sınamadığı, yazılımı kullananı en çok ısırabilecek durumlar (her birinin testi sahibi görevde):

1. İki admin aynı anda son kontenjanı atarsa yalnızca biri başarılı olmalı (Görev 4).
2. Başka şirketin admini, ya da kendi `companyId`'si ile **başka şirkete ait** `memberId/assignmentId/requestId` gönderen kullanıcı hiçbir şey okuyamaz/değiştiremez (Görev 3, 4).
3. Doğrulanmamış bir hesap için tekrar kayıt çağrısı, kayıttaki şirket niyetini (create/join) değiştiremez (Görev 3).
4. Kurumsal kayıtta genel posta uzantısı, e-postayla uyuşmayan uzantı ve başka şirkete ait uzantı reddedilir (Görev 1, 3).
5. Yanmış kontenjan kimseye (aynı kişi dahil) verilemez; geri alınmış (yanmamış) atama aynı kişiye verilince ilerleme korunur ve sertifika doğrulama linki çalışır (Görev 4).

---

## Dosya Yapısı

| Dosya | Sorumluluk |
|---|---|
| `src/lib/company-rules.ts` (yeni) | Saf kurallar: kod, uzantı, şemalar, atama/geri alma kararı, ilerleme durumu |
| `src/lib/company-rules.test.ts` (yeni) | Yukarıdakinin testleri |
| `db/migrations/020_companies.sql` (yeni) | Şema |
| `src/lib/company.ts` (yeni) | Şirket, üyelik, kayıt niyeti, katılım, üye işlemleri |
| `src/lib/company-seats.ts` (yeni) | Kontenjan: özet, ekleme, atama, geri alma, üye çıkarma, talepler, ilerleme raporu |
| `src/lib/company-guard.ts` (yeni) | `requireCompanyAccess`, `requireCompanyAdminPage` |
| `src/lib/company-panel.ts` (yeni) | Panel sayfaları için tek sorguyla veri (`getCompanyPanelData`) |
| `src/app/api/company/**` (yeni) | API yüzeyi (aşağıda) |
| `src/lib/orders.ts`, `src/lib/lms.ts` | Kontenjan siparişi, `fulfillOrder` dalı, `EnrollmentSource` |
| `src/app/api/auth/register`, `verify-email`, `checkout`, `gifts/checkout` | Entegrasyon |
| `src/components/company/*`, `src/app/sirket/**`, `src/app/admin/sirketler/**` | Arayüz |
| `scripts/test-company.mjs` (yeni) | Uçtan uca testler (`npm run test:company`) |

API yüzeyi: `POST /api/company/domain-lookup` · `POST /api/company/join` · `POST /api/company/requests` · `PATCH /api/company/[companyId]/members/[memberId]` · `POST /api/company/[companyId]/allocations` (yalnızca ana admin) · `POST /api/company/[companyId]/assignments` · `POST /api/company/[companyId]/assignments/[assignmentId]/reclaim` · `POST /api/company/[companyId]/requests/[requestId]` · `GET /api/company/[companyId]/progress` · `POST /api/company/[companyId]/checkout`.

---

### Task 1: Saf kurallar (`company-rules.ts`)

**Files:**
- Create: `src/lib/company-rules.ts`
- Test: `src/lib/company-rules.test.ts`

**Interfaces:**
- Produces (diğer görevler bunları kullanır):
  - `generateCompanyCode(name: string, pick?: (n: number) => number): string`, `normalizeCompanyCode(v: string): string`, `isCompanyCode(v: unknown): v is string`, `COMPANY_CODE_ALPHABET: string`
  - `normalizeDomain(v: string): string | null`, `emailDomain(email: string): string | null`, `isPublicDomain(d: string): boolean`, `PUBLIC_EMAIL_DOMAINS: ReadonlySet<string>`, `corporateEmailBlock(email: string, domain: string): "domain_mismatch" | null`
  - `corporateCompanySchema` (zod): `{ company_name, tax_office, tax_number, domain }`; `signupFieldsSchema`: `z.discriminatedUnion("account_type", [{account_type:"bireysel", company_code?: string}, {account_type:"kurumsal", company: corporateCompanySchema}])`
  - `type AssignBlockReason = "not_member" | "burned" | "already_owned" | "no_free"`; `assignBlock(i: { free: number; member: "active" | "other"; burned: boolean; alreadyHasAccess: boolean }): AssignBlockReason | null`
  - `WATCH_MIN_BYTES = 512 * 1024`; `isWatched(i: { completedLessons: number; streamBytes: number }): boolean`
  - `reclaimOutcome(watched: boolean, confirmBurn: boolean): "return" | "burn" | "needs_confirm"`
  - `allocationBlock(i: { currentTotal: number; assigned: number; burned: number; delta: number }): "zero" | "below_used" | null`
  - `canRemoveAdmin(adminCount: number): boolean` (adminCount ≥ 2 ise true)
  - `progressStatus(i: { completed: number; total: number; certificate: string | null }): "not_started" | "in_progress" | "completed"`
  - `SEAT_MAX_QUANTITY = 1000`, `seatCheckoutSchema` (zod: `slug`, `quantity` int 1..1000, `billing: billingSchema`, `consents: consentsSchema`, `card?: cardSchema`), `seatOrderTitle(courseTitle: string, quantity: number): string` → `"<ders> · <n> kişilik kontenjan"`
  - `MEMBER_PURCHASE_BLOCK_MESSAGE = "Şirket hesabına bağlı olduğunuz için bireysel satın alma yapılamaz. Şirket yöneticinizden talep edebilirsiniz."`

- [ ] **Step 1: Write the failing tests** in `src/lib/company-rules.test.ts` (`node:test` + `assert/strict`, `gift-rules.test.ts` stili). Test adları ve doğrulamalar:
  - `generateCompanyCode: ön ek Türkçe harfleri sadeleştirir` → `generateCompanyCode("Ağaç Yazılım A.Ş.", () => 0) === "AGAC-2222"`; `generateCompanyCode("Acme A.Ş.", () => 0) === "ACME-2222"`; `generateCompanyCode("123", () => 0)` `FRM-2222` ile başlar; rastgele çağrıda `/^[A-Z]{2,6}-[2-9A-HJ-NP-Z]{4}$/` eşleşir (0,O,1,I yok).
  - `normalizeCompanyCode/isCompanyCode`: `normalizeCompanyCode(" acme-7k4q ") === "ACME-7K4Q"`; `isCompanyCode("ACME-7K4Q") === true`; `"ACME-0K4Q"`, `"ACME7K4Q"`, `""`, `undefined` false.
  - `normalizeDomain`: `"@Acme.COM "` → `"acme.com"`; `"acme"`, `"a b.com"`, `""` → `null`.
  - `emailDomain`: `"Ali@Acme.com"` → `"acme.com"`; `"bozuk"` → `null`.
  - `isPublicDomain`: gmail.com, hotmail.com, outlook.com, yahoo.com, icloud.com, yandex.com, proton.me true; acme.com false.
  - `corporateEmailBlock`: `("ali@acme.com","acme.com") === null`; `("ali@gmail.com","acme.com") === "domain_mismatch"`.
  - `signupFieldsSchema`: bireysel kodsuz geçer; bireysel `company_code: "kötü"` hata; kurumsal `domain:"gmail.com"` hata; kurumsal `tax_number:"123"` hata; geçerli kurumsal (`domain:"@Acme.com"`) `domain === "acme.com"` olarak çıkar.
  - `assignBlock`: sırayla `not_member` (member:"other"), `burned`, `already_owned`, `no_free` (free:0); hepsi uygunsa `null`; birden fazla sorun varsa önce gelen döner (member:"other" + free:0 → `not_member`).
  - `isWatched`: `{0, 0}` false; `{1, 0}` true; `{0, WATCH_MIN_BYTES}` true; `{0, WATCH_MIN_BYTES - 1}` false.
  - `reclaimOutcome`: `(false,false)=return`, `(false,true)=return`, `(true,false)=needs_confirm`, `(true,true)=burn`.
  - `allocationBlock`: delta 0 → `zero`; `{currentTotal:10, assigned:6, burned:2, delta:-3}` → `below_used`; `delta:-2` → `null`; `delta:5` → `null`.
  - `canRemoveAdmin(1) === false`, `canRemoveAdmin(2) === true`.
  - `progressStatus`: `{0,12,null}` not_started; `{5,12,null}` in_progress; `{12,12,null}` completed; `{3,12,"PRF-1"}` completed (sertifika varsa).
  - `seatCheckoutSchema`: quantity 0 ve 1001 reddedilir, 25 geçerli (bireysel billing `{invoice_type:"bireysel", full_name:"Ali Veli", email:"a@x.com"}`, dört onay true); `seatOrderTitle("Excel", 25) === "Excel · 25 kişilik kontenjan"`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL (`company-rules.ts` bulunamıyor).

- [ ] **Step 3: Implement `src/lib/company-rules.ts`** yukarıdaki imzalarla. Notlar: kod ön eki = ilk kelimenin harfleri (Türkçe harfler ç→C ğ→G ı→I ö→O ş→S ü→U sadeleştirilir, harf dışı atılır), en çok 6, 2'den kısaysa `FRM`; sonek alfabesi `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`; `pick` verilmezse `node:crypto` `randomInt`. `PUBLIC_EMAIL_DOMAINS`: gmail.com, googlemail.com, hotmail.com, hotmail.com.tr, outlook.com, outlook.com.tr, live.com, msn.com, yahoo.com, yahoo.com.tr, icloud.com, me.com, yandex.com, yandex.com.tr, mynet.com, proton.me, protonmail.com. `corporateCompanySchema.tax_number` `/^\d{10}$/`, `domain` `normalizeDomain` ile dönüştürülür, null ya da genel uzantıysa hata ("Şirket mail uzantısı geçerli bir kurumsal alan adı olmalı."). `company_code` `normalizeCompanyCode` sonrası `isCompanyCode` değilse "Şirket kodu geçersiz." hatası.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS (tüm `company-rules` testleri dahil, mevcutlar bozulmadan).

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers src/lib/company-rules.ts src/lib/company-rules.test.ts
git commit -m "feat(company): saf şirket/kontenjan kuralları ve tasarım belgesi"
```

---

### Task 2: Şema (`020_companies.sql`)

**Files:**
- Create: `db/migrations/020_companies.sql`

**Interfaces:**
- Produces (tablolar/sütunlar; sonraki görevler bunlara yazar):
  - `companies(id, name, code UNIQUE, tax_office, tax_number, is_active DEFAULT 1, created_at)`
  - `company_domains(company_id FK cascade, domain UNIQUE)`
  - `company_members(id, company_id FK cascade, user_id UNIQUE FK cascade, role ENUM('member','admin'), status ENUM('pending','active'), requested_at, approved_at NULL, approved_by NULL)` — red/çıkarma satırı siler
  - `company_allocations(id, company_id FK, course_id FK RESTRICT, quantity INT (negatif olabilir, yalnızca source='admin'), source ENUM('purchase','admin'), order_id NULL FK SET NULL UNIQUE, created_by NULL, created_at)`
  - `company_assignments(id, company_id FK, course_id FK, user_id FK cascade, status ENUM('active','revoked','burned'), assigned_by, assigned_at, ended_at NULL, UNIQUE(company_id, course_id, user_id), KEY(company_id, course_id, status))`
  - `company_course_requests(id, company_id FK, course_id FK, user_id FK cascade, status ENUM('pending','fulfilled','rejected'), created_at, resolved_at NULL, resolved_by NULL, open_key TINYINT GENERATED ALWAYS AS (IF(status='pending',1,NULL)) STORED, UNIQUE(user_id, course_id, open_key))`
  - `company_signup_intents(user_id PK FK cascade, kind ENUM('create','join'), payload TEXT (JSON), created_at)`
  - `ALTER enrollments MODIFY source ENUM('admin','purchase','plus','gift','company')`; `ALTER orders ADD company_id INT UNSIGNED NULL` (+ index); `ALTER order_items MODIFY item_type ENUM('course','plus','program','seats'), ADD quantity INT UNSIGNED NOT NULL DEFAULT 1`

- [ ] **Step 1: Write `020_companies.sql`** tablolar ve ALTER'lar yukarıdaki gibi, başlıkta mevcut migrasyonlardaki gibi Türkçe açıklama yorumu (kontenjan: toplam = `SUM(company_allocations.quantity)`, atanan = `active`, yanan = `burned`, boş = toplam − atanan − yanan).
- [ ] **Step 2: Apply** — `.env`'in geliştirme DB'sine işaret ettiğini doğrula, sonra:

Run: `npm run db:migrate`
Expected: çıktıda `✓ uygulandı 020_companies.sql`.

- [ ] **Step 3: Verify tables** —

Run: `node --env-file=.env -e "import('mysql2/promise').then(async m=>{const c=await m.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});console.log((await c.query(\"SHOW TABLES LIKE 'company%'\"))[0].length);await c.end()})"`
Expected: `6`.

- [ ] **Step 4: Commit** — `git add db/migrations/020_companies.sql && git commit -m "feat(company): şirket ve kontenjan şeması (020)"`

---

### Task 3: Kayıt, katılım ve üyelik (API + e2e iskeleti)

**Files:**
- Create: `src/lib/company.ts`, `src/lib/company-guard.ts`, `src/app/api/company/domain-lookup/route.ts`, `src/app/api/company/join/route.ts`, `src/app/api/company/[companyId]/members/[memberId]/route.ts`, `scripts/test-company.mjs`
- Modify: `src/app/api/auth/register/route.ts`, `src/app/api/auth/verify-email/route.ts`, `package.json` (script `test:company`: `node --env-file=.env --experimental-strip-types --disable-warning=ExperimentalWarning scripts/test-company.mjs`)

**Interfaces:**
- Consumes: Görev 1'in `generateCompanyCode`, `normalizeCompanyCode`, `normalizeDomain`, `emailDomain`, `corporateEmailBlock`, `signupFieldsSchema`, `canRemoveAdmin`.
- Produces (`src/lib/company.ts`, `server-only`):
  - `type Membership = { companyId: number; companyName: string; role: "member" | "admin"; status: "pending" | "active" }`
  - `getMembership(userId: number): Promise<Membership | null>`
  - `isActiveMember(userId: number): Promise<boolean>`
  - `memberPurchaseBlock(userId: number): Promise<string | null>` (aktif üyeyse `MEMBER_PURCHASE_BLOCK_MESSAGE`)
  - `findCompanyByCode(code: string): Promise<{ id: number; name: string; code: string; is_active: boolean } | null>`; `findCompanyByDomain(domain: string)` aynı dönüş
  - `type SignupIntent = { kind: "create"; company: { name: string; taxOffice: string; taxNumber: string; domain: string } } | { kind: "join"; code: string }`
  - `saveSignupIntent(userId: number, intent: SignupIntent): Promise<void>`; `applySignupIntent(userId: number): Promise<void>` (intent'i tüketir; hata fırlatmaz, loglar)
  - `requestJoin(userId: number, companyId: number): Promise<"requested" | "already_member" | "inactive_company">`
  - `resolveMember(companyId: number, memberId: number, action: "approve" | "reject" | "promote" | "demote"): Promise<{ ok: true } | { ok: false; reason: "not_found" | "last_admin" | "bad_state" }>` (satırı `company_id` ile birlikte arar)
- Produces (`src/lib/company-guard.ts`):
  - `requireCompanyAccess(companyId: number): Promise<{ payload: JwtPayload; actor: "platform" | "company"; error?: undefined } | { payload?: undefined; actor?: undefined; error: NextResponse }>` — ana admin her şirkete, şirket admini (DB'de `role='admin' AND status='active'`) yalnızca kendi şirketine; olmayan şirket 404, yetkisiz 403.
  - `requireCompanyAdminPage(): Promise<{ user: SessionUser; companyId: number }>` (giriş yoksa `/giris?next=/sirket`, şirket admini değilse `/hesabim`'e redirect).

- [ ] **Step 1: Write the failing e2e checks** — `scripts/test-company.mjs` iskeleti `scripts/test-gifts.mjs`'i örnek alır (aynı `api/page/addUser/login/cookieFor/setKnownCode/check` yardımcıları, `@example.invalid` e-postaları, `e2e-company-*` ad öneki, sonda tüm kendi verisini silen `cleanup`). Bu görevin kontrolleri:
  - Kurumsal kayıt: `POST /api/auth/register` `{account_type:"kurumsal", company:{company_name, tax_office, tax_number:"1234567890", domain:"e2e<stamp>.test"}, email:"admin@e2e<stamp>.test", …}` → 201; doğrulama kodu `setKnownCode` ile bilinen koda çevrilip `POST /api/auth/verify-email` → 200; ardından `companies` satırı var, kodu `isCompanyCode`, `company_members` role `admin` status `active`.
  - Reddedilenler (400/409): genel uzantı (`gmail.com`), e-posta uzantısı farklı, başka şirkete ait uzantı (409), kötü `company_code`.
  - **Review Focus 3:** doğrulanmamış hesap için aynı e-postayla ikinci register çağrısı farklı niyetle (`join` başka kodla) yapılınca `company_signup_intents` satırı değişmez.
  - **Review Focus 4:** yukarıdaki reddedilenler bu maddeyi kapsar.
  - Bireysel kayıt + `company_code`: doğrulamadan sonra `company_members` status `pending`, role `member`.
  - `POST /api/company/domain-lookup {email:"x@e2e<stamp>.test"}` → `{found:true, name, code}`; eşleşmeyen uzantı → `{found:false}`; genel uzantı → `{found:false}`.
  - Giriş yapmış bireysel kullanıcı `POST /api/company/join {code}` → pending; zaten üyeyse 409.
  - Onay: şirket admini `PATCH /api/company/<id>/members/<memberId> {action:"approve"}` → 200, üye `active`; ana admin de onaylayabilir; `reject` satırı siler; `promote` role `admin`; `demote` son admini düşürmeye çalışınca 409.
  - **Review Focus 2:** başka şirketin admini aynı PATCH'i çağırınca 403; kendi `companyId`'si URL'de ama `memberId` başka şirketin → 404.

- [ ] **Step 2: Run to verify it fails**

Run (ayrı terminalde `npm run dev` açıkken): `npm run test:company`
Expected: FAIL (ilk kontrol: kurumsal kayıt 400 ya da şirket oluşmuyor).

- [ ] **Step 3: Implement `company.ts` + `company-guard.ts`** yukarıdaki imzalarla. Notlar: `createCompany` (iç) kod çakışmasında (`ER_DUP_ENTRY`) yeni kod üretip en çok 5 kez dener ve şirket + alan adı + admin üyeliğini tek transaction'da yazar; alan adı UNIQUE ihlali `domain_taken` olarak ele alınır. `applySignupIntent` `create` için alan adını ve e-posta uyuşmasını yeniden doğrular (başarısızsa kullanıcı bireysel kalır, loglanır), `join` için `findCompanyByCode` + `requestJoin` çağırır; her durumda intent satırını siler. `resolveMember`'da `approve` yalnızca `pending`, `promote/demote` yalnızca `active` üzerinde; `demote` son admini (`canRemoveAdmin`) düşürmez. Üye satırları her zaman `WHERE id = ? AND company_id = ?` ile aranır.
- [ ] **Step 4: Implement the HTTP surface** — `register` şemasına `signupFieldsSchema` alanları eklenir (varsayılan `bireysel`); kurumsal için e-posta/uzantı kontrolü (`corporateEmailBlock`, `isPublicDomain` şema içinde), `findCompanyByDomain` doluysa 409 "Bu mail uzantısı başka bir şirkete kayıtlı."; bireysel + `company_code` için kod yoksa/pasifse 400 "Şirket kodu geçersiz." Niyet **yalnızca yeni kullanıcı INSERT yolunda** `saveSignupIntent` ile kaydedilir (mevcut doğrulanmamış hesap yolunda dokunulmaz, bu yolun açıklamasındaki hesap-ele-geçirme gerekçesi aynen geçerli). `verify-email` route'unda `verifyEmailCode` başarılı olduktan sonra `await applySignupIntent(user.id)` çağrılır (hata yanıtı bozmaz). `domain-lookup` giriş gerektirmez, `{found, name?, code?}` döner (genel uzantı için `found:false`). `join` `requireUser` ister, `requestJoin` sonucuna göre 200/409/400. `members/[memberId]` `requireCompanyAccess(companyId)` ve `resolveMember` kullanır; `reason` → 404/409/400 eşlemesi.
- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:company` ve `npm run typecheck`
Expected: tüm kontroller `✓`, typecheck temiz.

- [ ] **Step 6: Commit** — `git add src scripts package.json && git commit -m "feat(company): kurumsal/bireysel kayıt, şirket kodu, katılım onayı"`

---

### Task 4: Kontenjan (ekleme, atama, geri alma, üye çıkarma, ilerleme raporu)

**Files:**
- Create: `src/lib/company-seats.ts`, `src/app/api/company/[companyId]/allocations/route.ts`, `…/assignments/route.ts`, `…/assignments/[assignmentId]/reclaim/route.ts`, `…/progress/route.ts`
- Modify: `src/app/api/company/[companyId]/members/[memberId]/route.ts` (`action:"remove"` + `confirm_burn`), `src/lib/lms.ts` (`EnrollmentSource` türüne `"company"`), `scripts/test-company.mjs`

**Interfaces:**
- Consumes: Görev 1 kuralları (`assignBlock`, `allocationBlock`, `isWatched`, `reclaimOutcome`, `progressStatus`, `canRemoveAdmin`); Görev 3 `requireCompanyAccess`.
- Produces (`src/lib/company-seats.ts`, `server-only`):
  - `type SeatSummary = { courseId: number; courseTitle: string; total: number; assigned: number; burned: number; free: number }`; `getSeatSummaries(companyId: number): Promise<SeatSummary[]>`
  - `addAllocation(i: { companyId: number; courseId: number; delta: number; source: "purchase" | "admin"; orderId?: number; createdBy?: number }): Promise<{ ok: true } | { ok: false; reason: "zero" | "below_used" | "no_course" }>`
  - `assignSeat(i: { companyId: number; courseId: number; userId: number; assignedBy: number }): Promise<{ ok: true } | { ok: false; reason: AssignBlockReason }>`
  - `reclaimSeat(i: { companyId: number; assignmentId: number; confirmBurn: boolean }): Promise<{ ok: true; outcome: "return" | "burn" } | { ok: false; reason: "not_found" | "needs_confirm"; courseTitle?: string }>`
  - `removeMember(i: { companyId: number; memberId: number; confirmBurn: boolean }): Promise<{ ok: true } | { ok: false; reason: "not_found" | "last_admin" | "needs_confirm"; courseTitles?: string[] }>`
  - `type ProgressRow = { assignmentId: number; userId: number; userName: string; userEmail: string; courseId: number; courseTitle: string; completedLessons: number; totalLessons: number; status: "not_started" | "in_progress" | "completed"; certificateCode: string | null }`; `listCompanyProgress(companyId: number): Promise<ProgressRow[]>` (yalnızca `active` atamalar)

- [ ] **Step 1: Write the failing e2e checks** (script'e eklenir; kurs `e2e-company-<stamp>` slug'ıyla DB'ye eklenir, 2 ders içerir):
  - Ana admin `POST /allocations {course_id, delta:2}` → 200, `getSeatSummaries` karşılığı toplam 2; şirket admini aynı uca → 403; `delta:0` → 400; atanan+yanan altına düşen negatif delta → 409.
  - Atama: aktif üyeye 200 ve `enrollments` satırı `source='company'`; pending/başka şirket üyesine 409 `not_member`; kursa zaten sahip kullanıcıya (önce `enrollments`'a admin kaydı) 409 `already_owned`; boş kontenjan yokken 409 `no_free`.
  - **Review Focus 1:** toplam 1 kontenjan, iki farklı üyeye `Promise.all` ile eş zamanlı atama → tam olarak biri 200, diğeri 409; `company_assignments` aktif sayısı 1.
  - Geri alma izlenmemiş: `POST …/reclaim {}` → `{outcome:"return"}`, assignment `revoked`, `enrollments` satırı silinmiş, boş sayı geri artmış; `lesson_progress` korunur.
  - Geri alma izlenmiş (`lesson_progress` ya da `video_stream_usage` bayt ≥ eşik eklenir): `reclaim {}` → 409 `needs_confirm`; `{confirm_burn:true}` → `{outcome:"burn"}`, assignment `burned`, boş sayı artmaz, `enrollments` silinir; aynı kullanıcıya yeniden atama 409 `burned`; başka üyeye atama 409 `no_free`.
  - **Review Focus 5:** revoked atama aynı kişiye yeniden verilince 200, `lesson_progress` hâlâ var, sertifikası varsa `enrollments.status='completed'`, `GET /api/public/certificates/<code>` hâlâ 200.
  - Üye çıkarma: `PATCH members/<id> {action:"remove"}` izlenmiş atamada 409 `needs_confirm`, `confirm_burn:true` ile 200; satır silinir, atamalar geri alınır/yanar; tek admini çıkarma 409 `last_admin`.
  - `GET /progress` → atanan üyeler için `completedLessons/totalLessons/status/certificateCode`; üyenin şirket dışı kayıtları (admin ataması) listede yok; başka şirketin admini 403.
  - **Review Focus 2:** kendi `companyId`'siyle başka şirkete ait `assignmentId` → `reclaim` 404.

- [ ] **Step 2: Run to verify it fails** — `npm run test:company` → FAIL (uçlar yok).
- [ ] **Step 3: Implement `company-seats.ts`**. Notlar: tüm yazan fonksiyonlar tek transaction'da `SELECT id FROM companies WHERE id = ? FOR UPDATE` ile şirketi kilitler (eş zamanlı atama yarışını engeller); özet `toplam = SUM(quantity)`, `assigned = COUNT(status='active')`, `burned = COUNT(status='burned')`. `assignSeat` aktif üyeliği ve atama satırını (varsa `revoked` → `active`'e çevirir, `burned` → `burned` engeli) okuyup `assignBlock` çağırır, sonra `INSERT IGNORE INTO enrollments (…, 'company')`; `affectedRows = 0` ise `already_owned` ile rollback; sertifikası varsa `status = 'completed'`. `reclaimSeat` `isWatched`'ı kurs için hesaplar: `completedLessons` = o kursun derslerinde `lesson_progress` sayısı, `streamBytes` = o kursun derslerinde `video_stream_usage.bytes` toplamı. `burn`/`return` ikisinde de `source='company'` olan `enrollments` satırı silinir, ilerleme ve sertifika silinmez. `removeMember` üyenin aktif atamalarını aynı kuralla işler; izlenmiş olan varsa ve `confirmBurn` yoksa hiçbir şey değiştirmeden `needs_confirm` + kurs adlarını döner.
- [ ] **Step 4: Implement routes** — `allocations` yalnızca `actor === "platform"` (şirket admini 403), gövde `{course_id, delta}` zod ile; `assignments` gövde `{user_id, course_id}`, `assignedBy` oturum kullanıcısı (admin kendine de atayabilir); `reclaim` gövde `{confirm_burn?: boolean}`; `progress` GET. Hata `reason` → HTTP: `not_member|already_owned|burned|no_free|below_used|needs_confirm|last_admin` 409, `zero|no_course` 400, `not_found` 404; `needs_confirm` yanıtı `courseTitle(s)` alanını ve "Bu eğitimin hakkı yeni bir kişiye verilemez…" mesajını taşır.
- [ ] **Step 5: Run to verify it passes** — `npm run test:company`, `npm run typecheck` → hepsi geçer.
- [ ] **Step 6: Commit** — `git add src scripts && git commit -m "feat(company): kontenjan ekleme, atama, geri alma ve ilerleme raporu"`

---

### Task 5: Bireysel satın alma kısıtı ve eğitim talebi

**Files:**
- Create: `src/app/api/company/requests/route.ts`, `src/app/api/company/[companyId]/requests/[requestId]/route.ts`
- Modify: `src/lib/company-seats.ts`, `src/app/api/checkout/route.ts`, `src/app/api/gifts/checkout/route.ts`, `scripts/test-company.mjs`

**Interfaces:**
- Consumes: `memberPurchaseBlock`, `assignSeat`, `requireCompanyAccess`.
- Produces (`company-seats.ts`):
  - `createCourseRequest(userId: number, courseId: number): Promise<{ ok: true } | { ok: false; reason: "not_member" | "already_owned" | "duplicate" | "no_course" }>`
  - `resolveCourseRequest(i: { companyId: number; requestId: number; action: "assign" | "reject"; actorId: number }): Promise<{ ok: true } | { ok: false; reason: "not_found" | "no_free" | "not_member" | "already_owned" | "burned" | "bad_state" }>` (`assign` → `assignSeat` + talep `fulfilled`; satır `company_id` ile aranır)
  - `type MyRequest = { id: number; courseTitle: string; status: "pending" | "fulfilled" | "rejected"; createdAt: string }`; `listMyRequests(userId: number): Promise<MyRequest[]>`

- [ ] **Step 1: Write the failing e2e checks:**
  - Aktif üye `POST /api/checkout` (geçerli kurs kalemiyle) → 403 ve mesaj `MEMBER_PURCHASE_BLOCK_MESSAGE`; Plus kalemi de 403; `POST /api/gifts/checkout` 403; şirket admini de (aynı kısıt) 403.
  - Pending üye ve bireysel kullanıcı `POST /api/checkout` → bu kısıttan geçer (başka sebeple 4xx olsa bile mesaj farklı).
  - `POST /api/company/requests {course_id}` aktif üye → 200; aynı kurs için ikinci açık talep → 409 `duplicate`; pending/bireysel → 403/409 `not_member`; kursa zaten sahip → 409.
  - Şirket admini `POST …/requests/<id> {action:"assign"}`: boş kontenjan varsa 200, talep `fulfilled`, enrollment açılır; yoksa 409 `no_free`; `reject` → `rejected`, üye yeni talep açabilir; başka şirketin admini 403; başka şirkete ait `requestId` 404.
- [ ] **Step 2: Run to verify it fails** — `npm run test:company` → FAIL.
- [ ] **Step 3: Implement** — `/api/checkout` ve `/api/gifts/checkout` `requireUser` sonrası ilk iş `const blocked = await memberPurchaseBlock(userId); if (blocked) return fail(blocked, 403);`. `createCourseRequest` aktif üyeliği, kursa sahipliği (mevcut `enrollments` satırı) ve yayında olmayan/olmayan kursu kontrol eder; tekrarlar `open_key` UNIQUE ihlali (`ER_DUP_ENTRY`) ile `duplicate` olur. Uç `requireUser` kullanır, `company_id` üyelikten türetilir (istemciden alınmaz).
- [ ] **Step 4: Run to verify it passes** — `npm run test:company`, `npm run typecheck`.
- [ ] **Step 5: Commit** — `git add src scripts && git commit -m "feat(company): üyelere bireysel satın alma kısıtı ve eğitim talebi"`

---

### Task 6: Şirketin kontenjan satın alması

**Files:**
- Create: `src/app/api/company/[companyId]/checkout/route.ts`
- Modify: `src/lib/orders.ts` (yeni `createSeatOrder`; `createCartOrder`'ın bekleyen sipariş araması `AND company_id IS NULL` koşulunu da alır), `src/lib/lms.ts` (`fulfillOrder`: `seats` kalemi), `scripts/test-company.mjs`

**Interfaces:**
- Consumes: `seatCheckoutSchema`, `seatOrderTitle`, `addAllocation`, `requireCompanyAccess`, `paymentProvider`, `startTamiCheckout`, `fulfillOrder`.
- Produces: `createSeatOrder(i: { userId: number; companyId: number; courseId: number; courseTitle: string; quantity: number; total: number; billing: Billing; provider: string; ip: string }): Promise<number>` (orderId) — `orders(plan='cart', company_id)` + tek `order_items(item_type='seats', course_id, title=seatOrderTitle(...), unit_price=total, quantity)`.

- [ ] **Step 1: Write the failing e2e checks:**
  - Şirket admini (`PAYMENT_MODE=manual`) `POST /api/company/<id>/checkout {slug, quantity:5, billing(kurumsal), consents}` → 201 `status:"pending"`; `orders.company_id` dolu, `amount = fiyat × 5`, tek kalem `seats`, `quantity 5`, `unit_price = amount`; ödeme onayı (`PATCH /api/admin/orders/<id> {action:"approve"}`) sonrası şirketin o kurs toplamı +5 (`source='purchase'`, `order_id` dolu); onay tekrarı kontenjanı ikinci kez artırmaz.
  - Sıradan üye ve başka şirketin admini 403; ana admin şirket adına alabilir; `quantity:0/1001` 400; ücretsiz (`price=0`) ve yayında olmayan kurs 400/404.
  - `createCartOrder` bekleyen-sipariş yeniden kullanımı kontenjan siparişini yeniden kullanmaz (aynı kullanıcı kurs sepeti siparişi verince ayrı sipariş oluşur).
- [ ] **Step 2: Run to verify it fails** — `npm run test:company` → FAIL.
- [ ] **Step 3: Implement** — route `gifts/checkout`'u örnek alır (`mock` anında `fulfillOrder`, `manual` pending, `tami` 3D yönlendirmesi; sepet öğesi `subCategory: "Kontenjan"`); kupon yok. `fulfillOrder` satır tipine `seats` ve `quantity` eklenir; `seats` satırı `INSERT INTO company_allocations (company_id, course_id, quantity, source, order_id) VALUES (?,?,?,'purchase',?)` yazar (`orders.company_id` kaynak; zaten ödenmişse fonksiyon baştan çıkar, çift yazım olmaz) ve kurs kaydı **açmaz**. Sipariş çekirdeği `fulfillOrder`'ın SELECT'inde `quantity` okunur.
- [ ] **Step 4: Run to verify it passes** — `npm run test:company`, `npm run typecheck`.
- [ ] **Step 5: Commit** — `git add src scripts && git commit -m "feat(company): şirketin kontenjan satın alması"`

---

### Task 7: Kayıt formu arayüzü

**Files:**
- Modify: `src/components/auth/RegisterForm.tsx`, `src/app/kayit/page.tsx` (gerekirse props)

**Interfaces:**
- Consumes: `POST /api/auth/register` (Görev 3 alanları), `POST /api/company/domain-lookup`.

- [ ] **Step 1: Implement** — formun üstüne iki seçilebilir kutu (Bireysel / Kurumsal; `aria-pressed`), metinler birebir:
  - Bireysel: "Kendiniz için eğitim alın, kendi hızınızda ilerleyin, sertifikanızı alın."
  - Kurumsal: "Şirketiniz için toplu eğitim alın, çalışanlarınıza atayın, ilerlemelerini takip edin."
  Bireysel: isteğe bağlı "Şirket kodu" alanı; e-posta alanından çıkınca (`onBlur`, `@` içeriyorsa) `domain-lookup` çağrılır, `found` ise "**{name}** şirketine bağlı mısınız? Mail uzantınız bu şirketle eşleşti." onay kutusu çıkar, işaretlenince kod alanı otomatik dolar (işaret kalkınca boşalır); kod doluysa "Kodu girerseniz şirket yöneticisinin onayından sonra şirkete bağlanırsınız. O zamana kadar bireysel hesap olarak devam edersiniz." açıklaması. Kurumsal: ek alanlar şirket adı, vergi dairesi, vergi no, şirket mail uzantısı (`@acme.com`); buton "Şirket hesabı oluştur"; istek gövdesi `{account_type:"kurumsal", company:{…}}`; kayıt sonrası yönlendirmede `next=/sirket` (kullanıcı `next` vermediyse). Mevcut şifre/KVKK/Turnstile/`giftToken` akışı değişmez; hediye kilitli e-postada alan eşleşmesi aranmaz.
- [ ] **Step 2: Verify** — Run: `npm run typecheck`. Sonra `npm run dev` ve tarayıcıda `/kayit`: iki kutu geçişi, kurumsal alanların açılması, `domain-lookup` eşleşmesi için DB'deki test şirketinin uzantısıyla e-posta yazınca onay kutusunun çıkması ve işaretlenince kodun dolması, geçersiz kurumsal gönderimde sunucu mesajının gösterilmesi. Expected: hepsi çalışır, konsolda hata yok.
- [ ] **Step 3: Commit** — `git add src && git commit -m "feat(company): kayıt formunda bireysel/kurumsal seçimi ve şirket kodu"`

---

### Task 8: Üye tarafı arayüz (kurs sayfası, profil kartı)

**Files:**
- Create: `src/components/company/RequestCourseButton.tsx`, `src/components/company/CompanyCard.tsx`
- Modify: `src/components/PurchasePanel.tsx`, `src/components/CourseCardActions.tsx` (ve onları render eden sayfalar: `src/app/kurslar/[slug]/page.tsx`, `src/app/kurslar/page.tsx`, ana sayfa/programlar gibi `CourseCard` kullanılan yerler — `grep -rn "CourseCardActions\|PurchasePanel" src` ile bul), `src/app/hediye-et/[slug]/page.tsx`, `src/app/hesabim/profil/page.tsx`

**Interfaces:**
- Consumes: `isActiveMember`, `getMembership`, `listMyRequests` (Görev 3, 5); `POST /api/company/requests`, `POST /api/company/join`.
- Produces: `RequestCourseButton({ courseId: number })` (talep gönderir; "Talep gönderildi" durumunu gösterir); `CompanyCard` (sunucu bileşeni: üyelik yoksa "Şirkete katıl" kod formu; `pending` ise "Şirket onayı bekleniyor"; `active` ise şirket adı, admin ise "Şirket paneli" linki (`/sirket`), ve `listMyRequests` listesi).

- [ ] **Step 1: Implement** — Kurs sayfaları `getCurrentUser` sonrası `isActiveMember(user.id)` okur ve `PurchasePanel`/`CourseCardActions`'a yeni `companyMember?: boolean` + `courseId` geçirir; `companyMember && !hasAccess` iken satın alma, sepet ve hediye düğmeleri yerine "Şirketimden talep et" (`RequestCourseButton`) görünür, `hasAccess` ise "Derse Git" aynen kalır. `/hediye-et/[slug]` aktif üyeyi `/kurslar/[slug]`'a yönlendirir. Profil sayfasına `CompanyCard` eklenir.
- [ ] **Step 2: Verify** — `npm run typecheck`; tarayıcıda: aktif üye hesabıyla kurs sayfasında üç düğmenin gizlenip "Şirketimden talep et"in çıkması, tıklayınca durumun "Talep gönderildi"ye dönmesi; bireysel hesapta sayfanın eskisi gibi olması; profilde kod girince "Şirket onayı bekleniyor" görünmesi. Expected: hepsi doğru.
- [ ] **Step 3: Commit** — `git add src && git commit -m "feat(company): üye arayüzü (talep düğmesi, profilde şirket kartı)"`

---

### Task 9: Şirket paneli ve kontenjan satın alma sayfası

**Files:**
- Create: `src/lib/company-panel.ts`, `src/components/company/CompanyPanel.tsx`, `src/components/company/ReclaimDialog.tsx`, `src/app/sirket/layout.tsx`, `src/app/sirket/page.tsx`, `src/app/sirket/kontenjan-al/[slug]/page.tsx`
- Modify: `src/proxy.ts` (matcher'a `"/sirket/:path*"`), `src/components/checkout/CheckoutForm.tsx` (`seats` modu), `src/app/hesabim/page.tsx` (şirket admini için "Şirket paneli" kartı)

**Interfaces:**
- Consumes: `requireCompanyAdminPage`, `getSeatSummaries`, `listCompanyProgress`, tüm `/api/company/[companyId]/…` uçları, `adminApi` (`src/components/admin/api.ts`).
- Produces: `getCompanyPanelData(companyId: number): Promise<{ company: { id: number; name: string; code: string }; seats: SeatSummary[]; progress: ProgressRow[]; pendingMembers: { id: number; name: string; email: string }[]; activeMembers: { id: number; userId: number; name: string; email: string; role: "member" | "admin" }[]; openRequests: { id: number; userName: string; courseId: number; courseTitle: string; freeSeats: number }[]; courses: { id: number; title: string; slug: string }[] }`; `CompanyPanel({ data, platform }: { data: …; platform?: boolean })` (`platform` ana admin görünümünde "Kontenjan tanımla" kutusunu açar, Görev 10).
- `CheckoutForm` `seats?: { companyId: number; slug: string; title: string; unitPrice: number; provider: string }` prop'u (`gift` ile birlikte kullanılmaz): adet alanı gösterir, toplam = `unitPrice × adet`, kupon kutusu ve sepet linki yok, fatura tipi `kurumsal` varsayılan ve şirket bilgisi öndoldurulur, gönderim `/api/company/<id>/checkout`.

- [ ] **Step 1: Implement** — `/sirket` sayfası `requireCompanyAdminPage()` ile korunur; panelde taslaktaki dört bölüm: **Kontenjanlar** (eğitim bazında Toplam/Atanan/Boş/Yanan; "Ata" üye seçimi, "Daha fazla al" → `/sirket/kontenjan-al/<slug>`), **Çalışanlar** (`progress` tablosu: çalışan, eğitim, `completed/total ders (%)`, durum etiketi "Başlamadı / Devam ediyor / Tamamlandı", sertifika kodu, "Kontenjanı geri al"), **Bekleyenler** (katılım istekleri Onayla/Reddet; eğitim talepleri "Kontenjan ata (N boş)" boş yoksa "Satın al" linki, ve Reddet), **Üyeler** (aktif üyeler: admin yap/kaldır, çıkar). Şirket kodu başlıkta kopyalanabilir gösterilir. `ReclaimDialog`: ilk çağrı `needs_confirm` dönerse kırmızı uyarı kutusu: "{Çalışan} bu eğitimde en az bir video izlemiş: **{kurs}**. Bu eğitimin hakkı yeni bir kişiye **verilemez**. Devam ederseniz erişimi kapanır ve kontenjan yanmış sayılır." Düğmeler "Vazgeç" / "Yine de geri al" (`confirm_burn:true`). Üye çıkarma aynı uyarıyı kullanır. Başarılı işlemden sonra `router.refresh()`; hata mesajları `Toast` ile.
- [ ] **Step 2: Verify** — `npm run typecheck`; tarayıcıda şirket admini hesabıyla `/sirket`: kontenjan tablosu sayıları DB ile uyuşuyor; atama, geri alma (izlenmemiş: uyarısız; izlenmiş: kırmızı uyarı + onayla yanma), katılım onayı, talep ata/reddet, kontenjan satın alma (manual sağlayıcıda "sipariş alındı", toplam = fiyat × adet) çalışıyor; şirket admini olmayan kullanıcı `/sirket`'e girince `/hesabim`'e dönüyor; çıkış yapmışsa `/giris`. Expected: hepsi doğru.
- [ ] **Step 3: Commit** — `git add src && git commit -m "feat(company): şirket paneli ve kontenjan satın alma sayfası"`

---

### Task 10: Ana admin ekranları ve raporlar

**Files:**
- Create: `src/app/admin/sirketler/page.tsx`, `src/app/admin/sirketler/[id]/page.tsx`, `src/app/api/admin/companies/[companyId]/route.ts`
- Modify: `src/components/admin/AdminTabs.tsx` ("Şirketler" sekmesi, `Kullanıcılar`'dan sonra), `src/app/admin/kullanicilar/page.tsx` + `src/components/admin/UsersTable.tsx` (şirket sütunu), `src/app/admin/kayitlar/page.tsx` + `src/components/admin/EnrollmentsPanel.tsx` (şirket sütunu ve filtre), `src/components/admin/EnrollmentsPanel.tsx` `SOURCE` haritasına `company: "Şirket"`, `src/app/api/admin/enrollments/route.ts` (GET'e şirket adı), `scripts/test-company.mjs`

**Interfaces:**
- Consumes: `getCompanyPanelData`, `CompanyPanel` (`platform` modu: "Kontenjan tanımla" formu `POST /api/company/<id>/allocations` ile; eksi değer girilebilir).
- Produces: `PATCH /api/admin/companies/[companyId]` `{ is_active?: boolean; add_domain?: string }` (`requireAdmin`; alan adı `normalizeDomain` + genel uzantı reddi + çakışmada 409); `/admin/sirketler` listesi: ad, kod, uzantılar, aktif üye sayısı, bekleyen katılım sayısı, toplam/atanan/yanan kontenjan, durum.

- [ ] **Step 1: Write the failing e2e checks** — ana admin `PATCH /api/admin/companies/<id> {is_active:false}` → 200 ve pasif şirkete yeni `join`/kod kaydı 400; sıradan kullanıcı 403; `add_domain:"gmail.com"` 400, çakışan uzantı 409; `GET /api/admin/enrollments` satırlarında `company_name` alanı atama yapılan çalışan için dolu, şirketsiz kullanıcı için `null`.
- [ ] **Step 2: Run to verify it fails** — `npm run test:company` → FAIL.
- [ ] **Step 3: Implement** — pasif şirkette `findCompanyByCode`/`domain-lookup` sonuç vermez (`is_active` süzülür). `/admin/kullanicilar` sorgusu `LEFT JOIN company_members m ON m.user_id = u.id LEFT JOIN companies c ON c.id = m.company_id` ile `company_name` ve `company_status` ekler. `/admin/kayitlar` aynı birleşimle şirket sütunu ve şirket seçici süzgeç ekler (sertifika sütunu zaten var). `/admin/sirketler/[id]` `getCompanyPanelData` + `<CompanyPanel platform />` gösterir, üstte pasifleştirme ve uzantı ekleme.
- [ ] **Step 4: Run to verify it passes** — `npm run test:company`, `npm run typecheck`; tarayıcıda `/admin/sirketler` listesi ve detay, kullanıcılar/kayıtlar sayfalarındaki şirket sütunu.
- [ ] **Step 5: Commit** — `git add src scripts && git commit -m "feat(company): ana admin şirket yönetimi ve şirket sütunları"`

---

### Task 11: Son doğrulama

**Files:** (değişiklik yok; gerekirse küçük düzeltmeler)

- [ ] **Step 1: Birim testleri** — Run: `npm test` → Expected: tümü PASS.
- [ ] **Step 2: Tip denetimi** — Run: `npm run typecheck` → Expected: hata yok.
- [ ] **Step 3: Üretim derlemesi** — Run: `npm run build` → Expected: derleme başarılı, yeni rotalar (`/sirket`, `/admin/sirketler`, `/api/company/...`) listede.
- [ ] **Step 4: Uçtan uca** — `npm run dev` açıkken `npm run test:company`; ayrıca mevcut `npm run test:gifts` ve `npm run test:api` → Expected: yeni kontroller ve mevcutlar `✓`, hiç `✗ FAIL` yok (mevcut hediye/sipariş akışının `fulfillOrder` değişikliğinden etkilenmediğinin kanıtı).
- [ ] **Step 5: Spec taraması** — `docs/superpowers/specs/2026-11-03-company-accounts-design.md` 4.1–4.7 ve 5. bölümü maddeleriyle tarayıp her birinin çalıştığını tarayıcıda bir kez gez (kayıt iki tür, kod/uzantı onay kutusu, katılım onayı, kontenjan alım + ana admin tanımı, atama/geri alma/yanma, üye satın alma kısıtı + talep, şirket raporu, ana admin raporu).
- [ ] **Step 6: Commit** (varsa düzeltmeler) — `git add -A && git commit -m "chore(company): son doğrulama düzeltmeleri"`

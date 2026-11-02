# Kurs Hediye Etme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giriş yapmış bir kullanıcı, tek bir kursu bir mail adresine hediye edebilsin; alıcı güvenli, tek kullanımlık bir linkle (yalnızca o mail adresiyle doğrulanmış hesap) kursu alsın.

**Architecture:** Yeni `gifts` tablosu bekleyen hediyeyi tutar. Hediye siparişi normal bir tek-kalemli siparişle (`plan='single'`) ödenir; `fulfillOrder` hediye siparişinde kursu gönderene yazmaz, hediyeyi aktive edip token üretir ve iki mail yollar. Alma, `/hediye/<token>` sayfasında token + doğrulanmış mail eşleşmesiyle, `FOR UPDATE` transaction'ıyla yapılır. Saf kurallar (`gift-rules.ts`) test edilebilir tutulur, DB/mail mantığı `gifts.ts`'te toplanır.

**Tech Stack:** Next.js 16 (App Router, `params` Promise), React 19, `mysql2` düz SQL, zod 3, nodemailer, `node --test` (saf mantık testleri).

**Spec:** `docs/superpowers/specs/2026-11-02-course-gifting-design.md`

## Global Constraints

- `AGENTS.md`: bu Next.js sürümü bilinenden farklı. Route handler / sayfa / `next.config.ts` `headers()` yazmadan önce `node_modules/next/dist/docs/` içindeki ilgili sayfayı oku (ör. `01-app/03-api-reference/05-config/01-next-config-js/headers.md`). `params` ve `searchParams` Promise'tir.
- Tüm kullanıcıya görünen metinler Türkçe, i18n kütüphanesi yok; mevcut mail tonu ve `src/app/ds.css` / `globals.css` sınıfları kullanılır (`btn`, `btn-primary`, `btn-secondary`, `card blueprint`, `field`, `input`), bileşen kütüphanesi eklenmez.
- Token: `randomBytes(32)` hex (64 karakter) — mevcut `createToken()` / `hashToken()` (`src/lib/tokens.ts`). DB'de yalnızca SHA-256 hash (`CHAR(64)`). Düz token yalnızca mailde / bir kez kullanıcıya gösterilen yanıtta yaşar.
- Hediye süresi 30 gün (`GIFT_TTL_DAYS`); not en fazla 300 karakter; yeniden gönderim/link yenileme: gift başına 60 sn cooldown + saatte 5; gönderen başına saatte en fazla 10 hediye oluşturma.
- Hediye yalnızca **doğrulanmış** ve alıcı mailiyle **birebir** (trim + küçük harf) eşleşen hesapla alınır. Hesap varlığını sızdıran hata mesajı yok; geçersiz/süresi dolmuş/alınmış link tek tip mesaj: `"Bu hediye linki geçersiz veya süresi dolmuş."`.
- Kupon hediyede **yok** (v1 kararı); fiyat daima sunucuda DB'den (`courses.price`) okunur; ücretsiz (`price <= 0`) kurs hediye edilemez.
- Zaman karşılaştırmaları DB saatiyle (`NOW()`), `verification.ts` deseni.
- GET istekleri durum değiştirmez; alma `POST /api/gifts/claim`.
- **Çalışma ağacında başka bir işe ait commit'siz değişiklikler var** (`git status`: `src/lib/lms.ts`, `src/lib/mail.ts`, `src/lib/auth.ts`, `src/components/ProfileMenu.tsx`, `db/migrations/015_lesson_comments.sql` …). Commit'lerde yalnızca bu planın dosyalarını `git add <dosya>` ile ekle; `lms.ts` ve `mail.ts` başkasının değişikliğini de içeriyor — bu iki dosyayı commit etmeden önce `git diff <dosya>` ile kendi hunk'larını ayır; ayıramıyorsan commit etme ve kullanıcıya sor.
- Migration numarası: `ls db/migrations` ile sıradaki boş numara (bu plan yazılırken **016**).

## Review Focus

Spec'in ima ettiği ama görev testlerinin doğrudan kapsamadığı durumlar (her biri sahibi görevde bir teste/doğrulamaya bağlandı):

1. Alıcı mailinde büyük harf/boşluk (`"  Ayse@Gmail.COM "`) — doğrulanmış `ayse@gmail.com` hesabıyla eşleşmeli (Task 1 testleri).
2. URL/gövdedeki bozuk, büyük harfli, çok uzun veya `../` içeren token — DB'ye gitmeden geçersiz sayılmalı (Task 1 `isGiftToken` testleri, Task 10 doğrulaması).
3. Gönderenin kendi mailine (herhangi bir harf biçimiyle) hediye göndermesi reddedilmeli (Task 1 `isSelfGift` testleri, Task 7).
4. `expires_at` geçmiş ama durumu hâlâ `pending` olan hediye (zamanlayıcı yok) alınamamalı ve okunduğunda `expired` işaretlenmeli (Task 1 `claimBlock` testi, Task 5 doğrulaması).
5. Alıcı kursa zaten sahipse hediye tüketilmemeli, `pending` kalmalı (Task 1 `claimBlock` testi, Task 10 doğrulaması).

Bilinen sınır (testlenmez): `gifts.course_id` FK `RESTRICT` olduğundan hediyesi olan bir kurs silinemez; yayından kaldırılan kurs hediyesi yine alınabilir.

---

### Task 1: Saf hediye kuralları

**Files:**
- Create: `src/lib/gift-rules.ts`
- Test: `src/lib/gift-rules.test.ts`

**Interfaces:**
- Consumes: `billingSchema`, `consentsSchema`, `cardSchema` from `./checkout-schema.ts` (uzantılı import, mevcut testlerin yaptığı gibi).
- Produces (diğer görevler bunlara güvenir):
  - sabitler: `GIFT_TTL_DAYS = 30`, `GIFT_MESSAGE_MAX = 300`, `GIFT_RESEND_COOLDOWN_SECONDS = 60`, `GIFT_MAX_SENDS_PER_WINDOW = 5`, `GIFT_SEND_WINDOW_MINUTES = 60`, `GIFT_MAX_CREATED_PER_HOUR = 10`, `GIFT_INVALID_MESSAGE = "Bu hediye linki geçersiz veya süresi dolmuş."`
  - `normalizeRecipientEmail(v: string): string` (trim + toLowerCase)
  - `isSelfGift(senderEmail: string, recipientEmail: string): boolean`
  - `isGiftToken(v: unknown): v is string` (`/^[0-9a-f]{64}$/`)
  - `maskEmail(email: string): string`
  - `type GiftStatus = "awaiting_payment" | "pending" | "claimed" | "expired" | "cancelled"`
  - `type GiftClaimReason = "invalid" | "wrong_account" | "unverified" | "already_owned"`
  - `claimBlock(gift: { status: GiftStatus; secondsLeft: number; recipientEmail: string } | null, user: { email: string; emailVerified: boolean }, alreadyOwns: boolean): GiftClaimReason | null`
  - `giftCheckoutSchema` (zod): `{ slug: string(1..120), recipient_email: trim+lowercase+email+max 190, message?: trim, max GIFT_MESSAGE_MAX, billing, consents, card? }`

- [ ] **Step 1: Write the failing tests** in `src/lib/gift-rules.test.ts` (`node:test` + `node:assert/strict`, `verification-code.test.ts` stilinde):
  - `normalizeRecipientEmail("  Ayse@Gmail.COM ") === "ayse@gmail.com"`
  - `isSelfGift("Ayse@gmail.com", " ayse@GMAIL.com")` true; `isSelfGift("a@x.com","b@x.com")` false
  - `isGiftToken`: 64 küçük hex → true; aynısının büyük harfli hali, 63 ve 65 karakterli, `"../" + "a".repeat(61)`, `""`, `undefined`, `123` → false
  - `maskEmail("ayse@gmail.com") === "a***@gmail.com"`; `maskEmail("a@x.com") === "a***@x.com"`; `@` içermeyen girdi → `"***"`
  - `claimBlock` — aktif hediye `{status:"pending", secondsLeft:100, recipientEmail:"ayse@gmail.com"}` ile: eşleşen doğrulanmış kullanıcı → `null`; `"  AYSE@gmail.com"` mailli doğrulanmış kullanıcı → `null`; farklı mail → `"wrong_account"`; eşleşen ama `emailVerified:false` → `"unverified"`; eşleşen doğrulanmış + `alreadyOwns:true` → `"already_owned"`; `gift=null` → `"invalid"`; `secondsLeft: 0` ve `-5` → `"invalid"`; durum `awaiting_payment`, `claimed`, `expired`, `cancelled` → `"invalid"`
  - `giftCheckoutSchema`: geçerli gövde (bireysel billing, dört onay true) parse olur ve `recipient_email` küçük harfe döner; `message` 301 karakter → hata; `message` 300 karakter → ok; `recipient_email: "abc"` → hata; `slug: ""` → hata; onaylardan biri `false` → hata
- [ ] **Step 2: Run to verify fail** — `npm test` → `gift-rules.test.ts` import hatasıyla FAIL.
- [ ] **Step 3: Implement** `src/lib/gift-rules.ts` yukarıdaki imzalarla. `claimBlock` sırası: `invalid` (gift yok / `status !== "pending"` / `secondsLeft <= 0`) → `wrong_account` (normalize edilmiş mailler farklı) → `unverified` → `already_owned`. Dosyada `server-only` import'u **olmasın** (Node test koşucusu yükleyebilsin).
- [ ] **Step 4: Run to verify pass** — `npm test` → tüm testler PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/gift-rules.ts src/lib/gift-rules.test.ts
git commit -m "feat(gifts): add pure gift rules and checkout schema"
```

---

### Task 2: Migration — `gifts` tablosu ve `enrollments.source='gift'`

**Files:**
- Create: `db/migrations/016_gifts.sql` (başlamadan `ls db/migrations`; 016 doluysa sıradaki numara)

**Interfaces:**
- Produces: `gifts` tablosu (aşağıdaki sütunlar), `enrollments.source` ENUM'unda `'gift'`.

- [ ] **Step 1: Write the migration** (diğer migration'lar gibi Türkçe açıklama başlığıyla):
  - `ALTER TABLE enrollments MODIFY COLUMN source ENUM('admin','purchase','plus','gift') NOT NULL DEFAULT 'admin';`
  - `CREATE TABLE IF NOT EXISTS gifts`: `id` INT UNSIGNED AI PK; `order_id` INT UNSIGNED NOT NULL; `sender_id` INT UNSIGNED NOT NULL; `course_id` INT UNSIGNED NOT NULL; `recipient_email` VARCHAR(190) NOT NULL; `message` VARCHAR(300) NULL; `status` ENUM('awaiting_payment','pending','claimed','expired','cancelled') NOT NULL DEFAULT 'awaiting_payment'; `token_hash` CHAR(64) NULL; `expires_at` DATETIME NULL; `claimed_by_user_id` INT UNSIGNED NULL; `claimed_at` DATETIME NULL; `sent_at` DATETIME NULL; `send_count` INT UNSIGNED NOT NULL DEFAULT 0; `send_window_start` DATETIME NULL; `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP.
  - Anahtarlar: `UNIQUE uq_gifts_order (order_id)`, `UNIQUE uq_gifts_token (token_hash)`, `KEY idx_gifts_sender (sender_id, created_at)`, `KEY idx_gifts_recipient (recipient_email)`.
  - FK'ler: `order_id` ve `sender_id` için `001_init.sql`'deki `orders.user_id` / `orders` ilişkisinin `ON DELETE` kuralını aynen yansıt (önce oku); `course_id → courses` `ON DELETE RESTRICT`; `claimed_by_user_id → users` `ON DELETE SET NULL`. Motor/charset/collation diğer tablolarla aynı (`InnoDB`, `utf8mb4`, `utf8mb4_unicode_ci`).
- [ ] **Step 2: Apply** — **önce** `SELECT name FROM schema_migrations` ile `015_lesson_comments.sql` uygulanmış mı bak (MySQL istemcisi veya `scripts/migrate.mjs` çıktısı). `npm run db:migrate` tüm uygulanmamış dosyaları çalıştırır; 015 uygulanmamışsa **kullanıcıya sor** (başka işe ait). Onay sonrası `npm run db:migrate` → `✓ uygulandı 016_gifts.sql`.
- [ ] **Step 3: Verify** — `DESCRIBE gifts;` sütunları ve `SHOW COLUMNS FROM enrollments LIKE 'source'` ENUM'da `gift`'i gösterir.
- [ ] **Step 4: Commit** — `git add db/migrations/016_gifts.sql && git commit -m "feat(gifts): add gifts table and gift enrollment source"`

---

### Task 3: Hediye mailleri

**Files:**
- Modify: `src/lib/mail.ts` (mevcut `layout()` + `deliver()` kullanılır; dosyada başkasının commit'siz değişikliği var — yalnızca ekleme yap)

**Interfaces:**
- Produces:
  - `sendGiftRecipientEmail(g: { to: string; senderName: string; courseTitle: string; message: string | null; url: string; expiresAt: string }): Promise<void>`
  - `sendGiftSenderEmail(g: { to: string; recipientEmail: string; courseTitle: string; url: string; expiresAt: string }): Promise<void>`

- [ ] **Step 1: Implement both** `sendPasswordResetEmail` desenini izleyerek (`deliver({to, subject, html, text})`, düğmeli `layout()`).
  - Alıcı: konu `"<senderName> sana bir kurs hediye etti — Profect"`; `intro` gönderen adı, kurs adı ve varsa notu içerir; düğme `"Hediyemi Al"`; `notice` son geçerlilik tarihini ve "Bu hediye yalnızca bu e-posta adresiyle alınabilir" cümlesini içerir. Not ve ad `layout()` içinde zaten `esc()`'lenir — ham HTML birleştirme **yapma**.
  - Gönderen: konu `"Hediyeniz hazır — Profect"`; `intro` alıcı adresini ve kursu söyler; düğme `"Hediye linki"`; `notice`: "Mail alıcıya ulaşmazsa bu linki ona başka bir yolla iletebilirsiniz. Link yalnızca <recipientEmail> adresiyle alınabilir."
- [ ] **Step 2: Verify** — `npm run typecheck` temiz.
- [ ] **Step 3: Commit** (yalnızca kendi hunk'ların; bkz. Global Constraints) — `git commit -m "feat(gifts): add gift recipient and sender emails"`

---

### Task 4: Sipariş yardımcılarını dışa aç, Tami başlatmayı ortaklaştır

**Files:**
- Modify: `src/lib/orders.ts` (`BILLING_COLUMNS` ve `billingValues`'i `export` et; davranış değişmez)
- Create: `src/lib/payment/start-tami.ts`
- Modify: `src/app/api/checkout/route.ts` (Tami bloğu helper'a taşınır, **davranış aynı**)

**Interfaces:**
- Produces:
  - `export const BILLING_COLUMNS: string`, `export function billingValues(b: Billing, ip: string): (string | null)[]` (orders.ts)
  - `startTamiCheckout(a: { orderId: number; total: number; billing: Billing; card: Card; ip: string; userId: number; baseUrl: string; basket: { key: string; title: string; subCategory: "Kurs" | "Abonelik"; price: number }[] }): Promise<{ ok: true; threeDSHtmlContent: string } | { ok: false; message: string }>` — `Card = z.infer<typeof cardSchema>`. `basket[].price` çağıranın hesapladığı **net** (kupon sonrası) fiyattır.

- [ ] **Step 1: Extract** — `route.ts` içindeki `// ── Tami 3D Secure ──` bloğunun (ref üretimi, `provider_ref` UPDATE, adres/alıcı/basket kurulumu, `authPayment3D`, başarısızlıkta `status='rejected'` UPDATE'i ve hata mesajı) tamamını `startTamiCheckout`'a taşı; route `if (!r.ok) return fail(r.message, 400); return ok({ orderId, status: "redirect", threeDSHtmlContent: r.threeDSHtmlContent }, 201);` döndürür.
- [ ] **Step 2: Verify no behavior change** — `npm run typecheck` temiz; `git diff src/app/api/checkout/route.ts` yalnızca taşıma olduğunu gösterir (basket/adres/`callbackUrl` alanları birebir aynı).
- [ ] **Step 3: Commit** — `git add src/lib/orders.ts src/lib/payment/start-tami.ts src/app/api/checkout/route.ts && git commit -m "refactor(checkout): share Tami start and billing helpers"`

---

### Task 5: Hediye çekirdek kütüphanesi (`gifts.ts`)

**Files:**
- Create: `src/lib/gifts.ts` (`import "server-only"`)

**Interfaces:**
- Consumes: Task 1 sabitleri/`claimBlock`/`GiftStatus`/`GiftClaimReason`; Task 3 mail fonksiyonları; Task 4 `BILLING_COLUMNS`/`billingValues`; `createToken`/`hashToken` (`tokens.ts`); `pool` (`db.ts`); `Billing` (`checkout-schema.ts`).
- Produces:
  - `giftUrl(token: string): string` → `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}/hediye/${token}`
  - `createGiftOrder(i: { senderId: number; courseId: number; courseTitle: string; price: number; recipientEmail: string; message: string | null; billing: Billing; provider: string; ip: string }): Promise<{ orderId: number; giftId: number }>` — tek transaction: `orders` (`plan='single'`, `course_id`, `amount=price`, `provider`, billing sütunları) + `order_items` (tek `course` satırı) + `gifts` (`awaiting_payment`, `recipient_email` normalize edilmiş).
  - `countRecentGiftsBySender(senderId: number): Promise<number>` (son 60 dk, her durum)
  - `activateGiftForOrder(conn: PoolConnection, orderId: number): Promise<{ giftId: number; token: string } | null>` — siparişe bağlı gift yoksa `null`; varsa (`awaiting_payment` veya `cancelled`) `FOR UPDATE` ile kilitler, token üretir, `status='pending'`, `token_hash`, `expires_at = NOW() + INTERVAL GIFT_TTL_DAYS DAY`, `sent_at = NOW()`, `send_count = 1`, `send_window_start = NOW()` yazar.
  - `sendGiftEmails(giftId: number, token: string, to?: "both" | "recipient"): Promise<void>` — asla fırlatmaz (hata `console.error`); gift + kurs adı + gönderen adı/mailı + son tarih (`formatDate`) için SQL okur.
  - `type GiftView = { id: number; status: GiftStatus; recipientEmail: string; courseId: number; courseSlug: string; courseTitle: string; senderName: string; message: string | null; secondsLeft: number }`
  - `findGiftByToken(token: string): Promise<GiftView | null>` — `isGiftToken` değilse DB'ye gitmeden `null`; hash ile arar; `pending` ve `expires_at <= NOW()` ise satırı `expired` yapıp `null` döner; `pending` dışı → `null`.
  - `recipientHasAccount(email: string): Promise<boolean>` — doğrulanmış, aktif kullanıcı var mı.
  - `claimGift(token: string, userId: number): Promise<{ ok: true; courseSlug: string } | { ok: false; reason: GiftClaimReason }>` — transaction: hash ile `SELECT … FOR UPDATE`, kullanıcıyı (`is_active=1`) ve `enrollments` sahipliğini oku, `claimBlock` uygula; `null` ise `INSERT IGNORE INTO enrollments (user_id, course_id, status, source) VALUES (?, ?, 'active', 'gift')`, gift'i `claimed` + `claimed_by_user_id` + `claimed_at = NOW()` yap, `token_hash`'i **NULL'la** (tek kullanım).
  - `type RotateResult = { status: "ok"; token: string } | { status: "rate_limited"; retryAfter: number } | { status: "not_found" }`
  - `rotateGiftToken(giftId: number, senderId: number): Promise<RotateResult>` — **tek koşullu `UPDATE`** (`verification.ts` `issueVerificationCode` deseni: SET sırası soldan sağa, `send_count` `send_window_start`'tan önce): yeni `token_hash`, `sent_at = NOW()`, pencere/sayaç; `WHERE id = ? AND sender_id = ? AND status = 'pending' AND expires_at > NOW()` + cooldown + saatlik sınır; `expires_at`'e **dokunma**. `affectedRows = 0` ise satırı (sahiplik + durum) sorgulayıp `not_found` ya da `retryAfter` hesapla.
  - `type SenderGift = { id: number; courseTitle: string; recipientEmail: string; status: GiftStatus; expiresAt: string | null; createdAt: string }`
  - `listGiftsForSender(senderId: number): Promise<SenderGift[]>` — yalnızca `sender_id = senderId` ve `status <> 'awaiting_payment'`; listelerken süresi geçmiş `pending`'leri `expired` olarak işaretler ve döndürür.
  - `cancelGiftsForOrder(orderId: number): Promise<void>` — `awaiting_payment → cancelled` (idempotent).

- [ ] **Step 1: Implement** yukarıdaki fonksiyonlar. Düz token yalnızca `activateGiftForOrder` / `rotateGiftToken` dönüşünde bulunur; loglama yok.
- [ ] **Step 2: Verify** — `npm run typecheck` temiz. Sonra mock sağlayıcıyla Task 7–10 sonrası uçtan uca doğrulama (Task 13); bu görevde tip + `npm test` yeterli.
- [ ] **Step 3: Commit** — `git add src/lib/gifts.ts && git commit -m "feat(gifts): add gift data layer (create, activate, claim, rotate)"`

---

### Task 6: `fulfillOrder` hediye dalı ve iptal kancaları

**Files:**
- Modify: `src/lib/lms.ts:330-377` (`fulfillOrder`; dosyada başkasının commit'siz değişikliği var — yalnızca bu fonksiyona dokun)
- Modify: `src/app/api/admin/orders/[orderId]/route.ts` (reject dalı)
- Modify: `src/app/api/checkout/tami-callback/route.ts` (`reject()` helper'ı)

**Interfaces:**
- Consumes: `activateGiftForOrder`, `sendGiftEmails`, `cancelGiftsForOrder` (Task 5).

- [ ] **Step 1: `fulfillOrder`** — `orders` `status='paid'` UPDATE'inden sonra, kalem döngüsünden önce `const gift = await activateGiftForOrder(conn, orderId);` çağır. `gift` doluysa kalem döngüsünü **atla** (kurs asla `o.user_id`'ye yazılmaz); kupon kaydı bloğu aynı kalır. `commit`'ten sonra `if (gift) after(() => sendGiftEmails(gift.giftId, gift.token));` ekle; mevcut `after(() => sendOrderReceipt(orderId))` kalır. `status === 'paid'` erken çıkışı idempotensiyi sağlar — değiştirme.
- [ ] **Step 2: İptal kancaları** — admin `reject` dalında `UPDATE` `affectedRows > 0` ise hemen `await cancelGiftsForOrder(id)`; `tami-callback` `reject(ref, …)` içinde sipariş id'sini bulup (`SELECT id FROM orders WHERE provider_ref = ?`) `cancelGiftsForOrder(id)` çağır. (Tami başlatma başarısızlığında iptal Task 7'de gift route'unda yapılır; `startTamiCheckout` hediyeden habersiz kalır.)
- [ ] **Step 3: Verify** — `npm run typecheck` temiz; `git diff src/lib/lms.ts` yalnızca `fulfillOrder` hunk'larını (ve başkasının önceden var olan hunk'larını) gösterir.
- [ ] **Step 4: Commit** — `git add src/app/api/admin/orders src/app/api/checkout/tami-callback`; `lms.ts` için Global Constraints'teki kurala uy (kendi hunk'ların ayrılamıyorsa kullanıcıya sor). `git commit -m "feat(gifts): branch fulfillOrder for gift orders and cancel unpaid gifts"`

---

### Task 7: `POST /api/gifts/checkout`

**Files:**
- Create: `src/app/api/gifts/checkout/route.ts`

**Interfaces:**
- Consumes: `giftCheckoutSchema`, `isSelfGift`, `GIFT_MAX_CREATED_PER_HOUR` (Task 1); `createGiftOrder`, `countRecentGiftsBySender`, `cancelGiftsForOrder` (Task 5); `startTamiCheckout` (Task 4); `fulfillOrder` (`lms.ts`); `requireUser`, `parseBody`, `fail`, `ok`, `serverError`, `getBaseUrl`; `paymentProvider()`; `getCourseBySlug`.
- Produces: yanıt şekli `/api/checkout` ile aynı: `{ orderId, status: "pending" | "paid" }` (201) veya `{ orderId, status: "redirect", threeDSHtmlContent }`.

- [ ] **Step 1: Implement** `POST`: `requireUser` → `parseBody(giftCheckoutSchema)` → kurs yok/yayında değil → `fail("Kurs bulunamadı.", 404)`; `price <= 0` → `fail("Ücretsiz kurslar hediye edilemez.", 400)`; gönderenin mailini DB'den oku, `isSelfGift` ise `fail("Kendinize hediye gönderemezsiniz; kursu normal satın alabilirsiniz.", 400)`; `countRecentGiftsBySender >= GIFT_MAX_CREATED_PER_HOUR` ise 429 `"Kısa sürede çok fazla hediye oluşturdunuz. Lütfen biraz sonra tekrar deneyin."`; `provider.requiresCard && !card` → 400. `createGiftOrder` sonra sağlayıcı dalı: `manual` → `pending`; `mock` → `fulfillOrder` + `paid`; `tami` → `startTamiCheckout` (tek kalemli basket, `subCategory: "Kurs"`, net fiyat = `price`); `!r.ok` ise `await cancelGiftsForOrder(orderId)` ve `fail(r.message, 400)`. Alıcının hesabı olup olmadığı veya kursa sahip olup olmadığı **kontrol edilmez**.
- [ ] **Step 2: Verify** — `npm run typecheck` temiz. (Uçtan uca Task 13.)
- [ ] **Step 3: Commit** — `git add src/app/api/gifts/checkout && git commit -m "feat(gifts): add gift checkout endpoint"`

---

### Task 8: Hediye et sayfası, checkout formunda hediye modu, sonuç sayfası

**Files:**
- Create: `src/app/hediye-et/[slug]/page.tsx`, `src/components/checkout/GiftRecipientFields.tsx`
- Modify: `src/components/checkout/CheckoutForm.tsx`, `src/app/odeme/sonuc/page.tsx`

**Interfaces:**
- Consumes: `paymentProvider()`, `getCourseBySlug`, `getCurrentUser`, `getAccountProfile` (`/odeme/page.tsx` deseni), `PaymentProviderId`.
- Produces: `CheckoutForm` yeni isteğe bağlı prop: `gift?: { slug: string; title: string; price: number; provider: PaymentProviderId }`. `gift` verilmediğinde davranış **birebir aynı** kalır.

- [ ] **Step 1: Sayfa** — `/hediye-et/[slug]`: oturum yoksa `redirect("/giris?next=" + encodeURIComponent("/hediye-et/" + slug))`; kurs yoksa `notFound()`; ücretsiz kursta `notFound()`; `metadata.robots = { index: false, follow: false }`; başlık "Kurs hediye et"; `<CheckoutForm defaults={…} gift={{…}} />`.
- [ ] **Step 2: `GiftRecipientFields`** — "Alıcı" kartı: `recipient_email` (type email, tek alan) ve `message` (textarea, `maxLength={GIFT_MESSAGE_MAX}`, kalan karakter sayacı). Hataları `errors` desenindeki `field-err` ile gösterir.
- [ ] **Step 3: `CheckoutForm` hediye modu** — `gift` varken: sepet/kupon/`useQuote` sonucu **kullanılmaz** (hook'lar koşulsuz çağrılmaya devam eder); özet kartında tek satır (kurs adı + `formatPrice(price)`), kupon bloğu gizli; `GiftRecipientFields` fatura kartından önce; sağlayıcı `gift.provider`'dan; gönderim `POST /api/gifts/checkout` gövdesi `{ slug, recipient_email, message, billing, consents, card? }`; "Sepete dön" bağlantısı `/kurslar/<slug>`; düğme metni `"Hediyeyi satın al"` / Tami'de `"<fiyat> öde"`. İstemci tarafı doğrulama `giftCheckoutSchema` alanlarını (alıcı mail, not) kullanır.
- [ ] **Step 4: Sonuç sayfası** — `orders` sorgusuna `EXISTS(SELECT 1 FROM gifts WHERE order_id = orders.id)` ile hediye mi olduğunu ekle. Hediye ise: `ClearCartOnMount` **render edilmez**; `paid` → başlık "Hediyen gönderildi", gövde "Alıcıya ve sana e-posta gönderdik. Mail ulaşmazsa linki Hediyelerim sayfasından alabilirsin.", CTA `/hesabim/hediyeler` "Hediyelerim"; `pending` → "Ödemen doğrulandığında hediye alıcıya e-postayla gönderilecek."; `rejected` CTA `/kurslar` "Kurslara dön".
- [ ] **Step 5: Verify** — `npm run typecheck` temiz; sepet akışı (`/odeme`) regresyonsuz: dev sunucuda sepete kurs ekleyip `/odeme` sayfasının önceki gibi açıldığını doğrula.
- [ ] **Step 6: Commit** — `git add src/app/hediye-et src/components/checkout src/app/odeme/sonuc && git commit -m "feat(gifts): add gift checkout page and result handling"`

---

### Task 9: "Hediye Et" düğmeleri

**Files:**
- Modify: `src/components/PurchasePanel.tsx`, `src/components/CourseCardActions.tsx`

**Interfaces:**
- Consumes: mevcut `loggedIn`, `hasAccess`, `slug` prop'ları (yeni prop yok).

- [ ] **Step 1: Implement** — Her iki bileşende, `hasAccess` olsun olmasın görünen, `lucide-react` `Gift` ikonlu `btn btn-secondary btn-block` bir bağlantı: `href = loggedIn ? "/hediye-et/" + slug : "/giris?next=" + encodeURIComponent("/hediye-et/" + slug)`, metin `"Hediye Et"`. `PurchasePanel`'de satın alma düğmelerinin altına; `CourseCardActions`'ta mevcut düzenin altına tam genişlikte, kart yüksekliğini bozmayacak kompakt stille (`btn` stili mevcut `btn` sabitiyle). Ücretsiz kurslarda (`price <= 0`) düğme gösterilmez — bu bilgi bileşene yoksa `PurchasePanel`/kart çağıranlarından `priceLabel`/`price` türetmek yerine yeni isteğe bağlı `giftable?: boolean` prop ekle (varsayılan `true`) ve çağıranlar `course.price > 0` geçsin (`kurslar/[slug]/page.tsx`, `kurslar/page.tsx`, `page.tsx`).
- [ ] **Step 2: Verify** — `npm run typecheck` temiz; kurs sayfasında ve kartta düğme görünür, oturumsuzken `/giris?next=…`'e, oturumluyken `/hediye-et/<slug>`'a gider.
- [ ] **Step 3: Commit** — `git add src/components/PurchasePanel.tsx src/components/CourseCardActions.tsx src/app/kurslar src/app/page.tsx && git commit -m "feat(gifts): add gift buttons to course card and panel"`

---

### Task 10: Alma — `/hediye/[token]` sayfası, `POST /api/gifts/claim`, güvenlik başlıkları

**Files:**
- Create: `src/app/hediye/[token]/page.tsx`, `src/components/gifts/ClaimGiftButton.tsx`, `src/app/api/gifts/claim/route.ts`
- Modify: `next.config.ts` (`headers()`)

**Interfaces:**
- Consumes: `findGiftByToken`, `recipientHasAccount`, `claimGift` (Task 5); `isGiftToken`, `maskEmail`, `normalizeRecipientEmail`, `GIFT_INVALID_MESSAGE` (Task 1); `getCurrentUser`, `requireUser`.
- Produces: `POST /api/gifts/claim` gövde `{ token: string }`; başarı `{ courseSlug }`; hata durumları: `invalid` → 404 `GIFT_INVALID_MESSAGE`; `wrong_account` / `unverified` → 403; `already_owned` → 409 `"Bu kursa zaten sahipsin. Hediye hesabına eklenmedi."`.

- [ ] **Step 1: next.config.ts** — önce `headers.md` docs'u oku; `source: "/hediye/:token*"` için `Referrer-Policy: no-referrer` ve `Cache-Control: no-store` ekle (mevcut ayarlara dokunma).
- [ ] **Step 2: Sayfa** — `generateMetadata`: `robots: { index: false, follow: false }`. Akış: `await params`; `findGiftByToken` `null` ise tek tip mesaj kartı (`GIFT_INVALID_MESSAGE`, ana sayfa linki). Oturum yoksa: `recipientHasAccount(gift.recipientEmail)` doğruysa `redirect("/giris?next=" + encodeURIComponent("/hediye/" + token))`, değilse `redirect("/kayit?hediye=" + token + "&next=" + encodeURIComponent("/hediye/" + token))`. Oturum varsa: `normalizeRecipientEmail(user.email) === gift.recipientEmail` ise hediye kartı (gönderen adı, kurs adı, not — React escape'ine güven, `dangerouslySetInnerHTML` yok) + `ClaimGiftButton`; değilse "Bu hediye başka bir hesaba ait" kartı, `maskEmail(gift.recipientEmail)` ve çıkış yapıp doğru hesapla girmeyi söyleyen metin.
- [ ] **Step 3: `ClaimGiftButton`** — `POST /api/gifts/claim`, başarıda `router.push("/ogrenim/" + courseSlug)` + `router.refresh()`; hata mesajını `FormMessage` ile göster.
- [ ] **Step 4: API** — `requireUser`; gövde zod ile `{ token: z.string().refine(isGiftToken) }`; `claimGift(token, userId)` sonucunu yukarıdaki eşlemeyle döndür.
- [ ] **Step 5: Verify** — `npm run typecheck` temiz. `curl -i http://localhost:3000/hediye/abc` → 200 sayfa, içinde `GIFT_INVALID_MESSAGE`; yanıt başlıklarında `Referrer-Policy: no-referrer` ve `Cache-Control: no-store`. `../` ve 200 karakterli token ile aynı tek tip mesaj (DB sorgusu yok; `isGiftToken` kısa devre).
- [ ] **Step 6: Commit** — `git add src/app/hediye src/components/gifts src/app/api/gifts/claim next.config.ts && git commit -m "feat(gifts): add claim page, claim endpoint and security headers"`

---

### Task 11: Kayıt akışında kilitli mail

**Files:**
- Modify: `src/app/kayit/page.tsx`, `src/components/auth/RegisterForm.tsx`, `src/app/api/auth/register/route.ts`

**Interfaces:**
- Consumes: `findGiftByToken`, `isGiftToken`, `GIFT_INVALID_MESSAGE`.
- Produces: `RegisterForm` yeni isteğe bağlı prop'lar `lockedEmail?: string`, `giftToken?: string`; register gövdesine isteğe bağlı `giftToken: string`.

- [ ] **Step 1: Sayfa** — `searchParams`'a `hediye?: string` ekle. `isGiftToken(hediye)` ve `findGiftByToken` doluysa `RegisterForm`'a `lockedEmail={gift.recipientEmail}` ve `giftToken` ver; değilse mevcut sayfa aynen (token geçersizse üstte `GIFT_INVALID_MESSAGE` bilgi satırı, form normal). Oturum açıksa mevcut `redirect(next)` davranışı korunur.
- [ ] **Step 2: Form** — `lockedEmail` varsa `form.email` başlangıcı bu değer, alan `readOnly` + kilit görünümü ve kısa açıklama ("Hediyeyi alabilmek için bu adresle kayıt olmalısın."); `giftToken` varsa gövdeye eklenir.
- [ ] **Step 3: API** — şemaya `giftToken: z.string().refine(isGiftToken).optional()`. Varsa `findGiftByToken` ile doğrula (`null` → `fail(GIFT_INVALID_MESSAGE, 400)`) ve **gövdedeki `email`'i yok sayıp** `gift.recipientEmail`'i kullan; sonraki akış (insert / yarım kayıt yeniden kullanımı / kod gönderimi) değişmez. `giftToken` yoksa davranış birebir aynı.
- [ ] **Step 4: Verify** — `npm run typecheck` temiz. Uçtan uca doğrulama Task 13'te; bu görevde: gövdede farklı `email` + geçerli `giftToken` ile `curl -X POST /api/auth/register` kaydın **hediye mailiyle** açıldığını (DB'de `users.email`) gösterir (Turnstile kapalı dev ortamında).
- [ ] **Step 5: Commit** — `git add src/app/kayit src/components/auth/RegisterForm.tsx src/app/api/auth/register && git commit -m "feat(gifts): lock registration email to the gift recipient"`

---

### Task 12: Gönderen paneli — `/hesabim/hediyeler` ve link API'si

**Files:**
- Create: `src/app/hesabim/hediyeler/page.tsx`, `src/components/gifts/GiftActions.tsx`, `src/app/api/gifts/[giftId]/link/route.ts`
- Modify: `src/components/account/items.ts` (`Gift` ikonlu "Hediyelerim" öğesi, "Siparişlerim"in altına)

**Interfaces:**
- Consumes: `listGiftsForSender`, `rotateGiftToken`, `giftUrl`, `sendGiftEmails` (Task 5); `requireUser`, `parseId`.
- Produces: `POST /api/gifts/[giftId]/link` gövde `{ mode: "copy" | "email" }` → 200 `{ link: string, emailed: boolean }`; cooldown/limitte 429 `{ message, retryAfter }`; sahiplik/durum uyuşmazlığında 404.

- [ ] **Step 1: API** — `params: Promise<{ giftId: string }>` (`admin/orders/[orderId]/route.ts` deseni); `requireUser`; `rotateGiftToken(giftId, userId)`; `rate_limited` → 429; `not_found` → 404; `ok` → `link = giftUrl(token)`; `mode === "email"` ise `after(() => sendGiftEmails(giftId, token, "recipient"))` ve `emailed: true`.
- [ ] **Step 2: Sayfa** — `PageTitle title="Hediyelerim"`; boşsa açıklama + `/kurslar` bağlantısı; tablo (siparişlerim sayfasının `admin-table-wrap`/`table` deseni): kurs, alıcı mail, durum (`pending`: "Bekliyor", `claimed`: "Alındı", `expired`: "Süresi doldu"), bitiş tarihi (`formatDate`), `pending` satırlarda `GiftActions`.
- [ ] **Step 3: `GiftActions`** — iki düğme: "Linki yenile ve kopyala" (`mode: "copy"`, `navigator.clipboard.writeText(link)`, başarıda "Link kopyalandı. Önceki link artık geçersiz.") ve "Maili yeniden gönder" (`mode: "email"`, "Alıcıya yeni linkli mail gönderildi. Önceki link artık geçersiz."). İlk tıklamadan önce küçük bir not: "Yenilenen linkle birlikte eski link geçersiz olur." 429'da `retryAfter` saniyesini göster, düğmeyi o süre devre dışı bırak. Pano erişimi reddedilirse linki salt-okunur bir `input`'ta göster.
- [ ] **Step 4: Nav** — `ACCOUNT_ITEMS`'a `{ href: "/hesabim/hediyeler", label: "Hediyelerim", icon: Gift }` ekle.
- [ ] **Step 5: Verify** — `npm run typecheck` temiz; başka bir kullanıcının `giftId`'siyle aynı endpoint → 404 (Task 13 listesinde de).
- [ ] **Step 6: Commit** — `git add src/app/hesabim/hediyeler src/components/gifts/GiftActions.tsx src/app/api/gifts/[giftId] src/components/account/items.ts && git commit -m "feat(gifts): add sender gift list with link rotation and resend"`

---

### Task 13: Uçtan uca doğrulama

**Files:** yok (yalnızca doğrulama; bulunan hatalar ilgili göreve geri düzeltilir)

- [ ] **Step 1: Otomatik kontroller** — `npm test` (tüm testler PASS), `npm run typecheck` (temiz), `npm run build` (başarılı).
- [ ] **Step 2: Ortam** — `.env`'de `PAYMENT_PROVIDER=mock` ve `MAIL_DRY_RUN=true` ile `npm run dev`; iki kullanıcı: A (gönderen, doğrulanmış) ve henüz **kayıtlı olmayan** `yeni@example.com`.
- [ ] **Step 3: Mutlu yol** — A ile kurs sayfasında "Hediye Et" → `yeni@example.com` + not → öde (mock). Konsolda iki `[mail:dry-run]` çıktısı (alıcıya, A'ya) **aynı** `/hediye/<64hex>` linkini içerir; A'nın `enrollments`'ında kurs **yok**; `gifts.status='pending'`, `token_hash` 64 karakter. Linki gizli pencerede aç → `/kayit?hediye=…`'a yönlenir, e-posta alanı dolu ve salt okunur → kayıt ol → konsoldaki 6 haneli kodla doğrula → `/hediye/<token>`'a döner → "Hediyeyi Al" → kursa yönlenir; `enrollments.source='gift'`, `gifts.status='claimed'`, `token_hash IS NULL`.
- [ ] **Step 4: Saldırı/kenar durumları** — (a) aynı linki ikinci kez aç → tek tip geçersiz mesajı; (b) başka doğrulanmış hesapla açılan geçerli link → "başka hesaba ait", mail maskeli, `POST /api/gifts/claim` → 403; (c) kayıt gövdesinde farklı `email` + geçerli `giftToken` → kayıt hediye mailiyle açılır; (d) alıcı kursa zaten sahipken alma → 409, gift `pending` kalır; (e) `expires_at`'i SQL ile geçmişe çek → sayfa/alma geçersiz, gift `expired`'a döner; (f) A kendi mailine hediye → 400; (g) aynı gönderenle 11. hediye (saat içinde) → 429; (h) `rotate`: "Linki yenile ve kopyala" → eski link geçersiz, yeni link geçerli, ikinci tıklama 60 sn içinde 429 ve `retryAfter`; başka kullanıcının `giftId`'si → 404; (i) hediye notuna `<script>` yaz → dry-run mailinde kaçışlanmış (`&lt;script&gt;`) çıkar ve claim sayfasında metin olarak görünür; (j) iki sekmeden eşzamanlı "Hediyeyi Al" → yalnızca biri başarılı.
- [ ] **Step 5: Yöntem dışı** — `PAYMENT_PROVIDER=manual` ile hediye siparişi `pending` kalır, gift `awaiting_payment`; admin panelinden onaylayınca gift `pending`'e geçer ve mailler gider; reddedilen siparişte gift `cancelled` olur. Normal sepet satın alması (kurs sepete → `/odeme` → mock) hâlâ kursu **alıcıya** yazar.
- [ ] **Step 6: Rapor** — sonuçları (geçen/kalan maddeler) kullanıcıya özetle; bilinen sınırı (hediyesi olan kurs silinemez) ve admin sipariş listesinde hediyenin ayrı işaretlenmediğini belirt.

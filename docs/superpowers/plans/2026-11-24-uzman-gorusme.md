# Uzmanlarla Görüşme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ana sayfadan Kaan Tunçbilek / Tuğrul Günal ile (≤30 dk) görüşme talebi, uzman yanıtı (girişsiz token link), müsaitlik takvimi ve admin "Görüşmeler" sekmesi.

**Architecture:** Kural tabanlı müsaitlik (saf fonksiyonla slot hesabı) + durum makinesi (saf kural modülü) + MySQL tabloları; mailler `src/lib/mail.ts` `deliver` üzerinden; uzman/ziyaretçi yanıtları ham token mailde, DB'de SHA-256 (`src/lib/tokens.ts`).

**Tech Stack:** Next.js 16.4.6 (kod yazmadan önce `node_modules/next/dist/docs/` ilgili kılavuzları oku — AGENTS.md), React 19, mysql2, zod, nodemailer, Turnstile, `node --test` (`src/lib/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-24-uzman-gorusme-design.md`

## Global Constraints
- Saat dilimi sabit `Europe/Istanbul` (UTC+3, DST yok); DB'de tarihler string (`dateStrings: true`), yerel İstanbul zamanı `YYYY-MM-DD HH:mm:ss` olarak saklanır.
- Süre yalnızca 15 veya 30 dk; slot başlangıçları 30 dk adımlı; en erken +24 saat, en geç +60 gün.
- Uzman adresleri: kaan → `kaan.tuncbilek@xellence.com.tr`, tugrul → `tugrul@tugrulgunaldanismanlik.com`.
- Token 30 gün geçerli; ham token yalnızca mailde, DB'de SHA-256.
- Her geçerli e-posta kabul edilir (ücretsiz sağlayıcılar dahil). Giriş zorunlu değil.
- Mail metinleri Türkçe; kullanıcı girdisi `esc` ile kaçışlanır; testler `MAIL_DRY_RUN=true` ile.
- Bekleyen talep slotu kilitlemez; yalnızca `accepted`/`confirmed` slotu kapatır; kabulde çakışma işlem içinde yeniden kontrol edilir.
- Migration idempotent (`CREATE TABLE IF NOT EXISTS`), dosya `db/migrations/029_expert_meetings.sql`.

## Review Focus
- Gece yarısını/ay sonunu aşan tekrar (aylık kural 31'inde, şubat'ta): ay günü yoksa o ay atlanır.
- "Müsait değil" kuralı ile müsait kural aynı anı kapsarsa slot çıkmaz.
- İki ziyaretçi aynı slotu `pending` iken ister; ilk kabul slotu alır, ikincisinin kabulü 409 döner.
- Süresi dolmuş/kullanılmış token ve geçersiz durum geçişi (ör. `declined` talebi tekrar kabul) 409/410 döner.
- Mail içindeki ad/şirket alanında HTML/başlık enjeksiyonu (`<script>`, `\r\n`) kaçışlanır / reddedilir.

---

### Task 1: Uzman verisi, şema ve saf kurallar

**Files:**
- Create: `db/migrations/029_expert_meetings.sql`, `src/data/experts.ts`, `src/lib/meeting-rules.ts`, `src/lib/meeting-slots.ts`
- Test: `src/lib/meeting-rules.test.ts`, `src/lib/meeting-slots.test.ts`

**Interfaces:**
- Produces:
  - `EXPERTS: Record<ExpertId, { id; name; role; photo; email; topics: string[] }>`, `type ExpertId = "kaan" | "tugrul"` (`src/data/experts.ts`; konular: Tuğrul — Tedarik zinciri, Liderlik, Eğitim; Kaan — Yapay zekâ, Teknoloji, Satış & pazarlama).
  - `type MeetingStatus = "pending"|"counter_proposed"|"accepted"|"confirmed"|"declined"|"cancelled"`; `type MeetingAction = "accept"|"decline"|"counter"|"visitor_accept"|"visitor_decline"|"set_link"|"cancel"`; `canTransition(from: MeetingStatus, action: MeetingAction, actor: "expert"|"visitor"|"admin"): MeetingStatus | null`.
  - `type Rule = { kind:"available"|"blocked"; recurrence:"once"|"daily"|"weekly"|"monthly"; date: string|null; startsOn: string; until: string|null; weekdays: number; startTime: string; endTime: string }` (weekdays bitmask, Pzt=1 … Paz=64).
  - `computeSlots(args: { rules: Rule[]; booked: {startsAt:string; endsAt:string}[]; durationMin: 15|30; now: Date; day: string }): string[]` — verilen gün (`YYYY-MM-DD`) için boş başlangıç saatleri (`HH:mm`), +24 saat/+60 gün penceresi dışı boş döner.
  - `ruleCoversDay(rule: Rule, day: string): boolean`.
  - `isValidSlot(args same minus day, startsAt: string): boolean`.

- [ ] **Step 1: Failing tests** `meeting-rules.test.ts`: `canTransition("pending","accept","expert") === "accepted"`; `("accepted","set_link","expert"|"admin") === "confirmed"`; `("pending","counter","expert") === "counter_proposed"`; `("counter_proposed","visitor_accept","visitor") === "accepted"`; `("declined","accept","expert") === null`; `("confirmed","cancel","admin") === "cancelled"`; `("pending","cancel","visitor") === "cancelled"`; `("confirmed","cancel","visitor") === null`.
  `meeting-slots.test.ts` (Review Focus satırlarını burada pinle): haftalık Pzt-Cum 10:00-12:00 müsait → Salı için 15 dk'da `["10:00","10:30","11:00","11:30"]` (30 dk adım, süre sığıyorsa; 30 dk süre için son slot 11:30); aynı gün 10:30-11:00 blocked → `10:30` yok; kabul edilmiş toplantı 11:00-11:30 → `11:00` yok; aylık 31. kural şubatta `ruleCoversDay` false; `until` geçmişse false; +24 saatten yakın slot yok; +60 gün sonrası boş.
- [ ] **Step 2:** `npm test` → FAIL (modül yok).
- [ ] **Step 3:** Migration: `expert_availability_rules`, `meeting_requests`, `meeting_request_events` (sütunlar tasarım dokümanındaki gibi; `meeting_requests`: `expert`, `duration_min`, `starts_at`, `ends_at`, `full_name`, `email`, `company`, `job_title`, `user_id NULL`, `status`, `proposed_starts_at NULL`, `meeting_url NULL`, `expert_token_hash`, `visitor_token_hash`, `token_expires_at`, `decision_note NULL`, `created_at`, `updated_at`; indeks `(expert,starts_at)`, `(email,created_at)`). `experts.ts`, `meeting-rules.ts`, `meeting-slots.ts` uygula (saf, `server-only` yok ki `node --test` çalışsın; `.ts` uzantılı relative import).
- [ ] **Step 4:** `npm test` → PASS; `npm run typecheck` temiz.
- [ ] **Step 5:** `git add db src && git commit -m "feat(meetings): şema, uzman verisi, durum ve slot kuralları"`

### Task 2: Veri katmanı (meetings.ts)

**Files:** Create `src/lib/meetings.ts`, `src/lib/meeting-schemas.ts`; Test: `scripts/test-meetings.mjs` (+ `package.json` script `test:meetings`, `test:refunds` kalıbında).

**Interfaces:**
- Consumes: Task 1 tümü; `createToken`/`hashToken` (`tokens.ts`); `pool` (`db.ts`).
- Produces (`meetings.ts`, hepsi `server-only`):
  - `listSlotsForDay(expert: ExpertId, durationMin: 15|30, day: string): Promise<string[]>`; `listAvailableDays(expert, durationMin): Promise<string[]>` (pencere içi, boş slotu olan günler).
  - `createMeetingRequest(input: { expert; durationMin; startsAt: string; fullName; email; company; jobTitle; userId: number|null }): Promise<{ id: number; expertToken: string; visitorToken: string } | { error: "slot_unavailable"|"rate_limited" }>` (aynı e-posta/gün ≤3 talep).
  - `getMeetingByToken(raw: string): Promise<{ meeting: MeetingRow; role: "expert"|"visitor" } | null>` (süresi dolduysa null).
  - `applyMeetingAction(args: { id: number; action: MeetingAction; actor: "expert"|"visitor"|"admin"; actorId?: number; startsAt?: string; meetingUrl?: string; note?: string }): Promise<{ ok: true; meeting: MeetingRow } | { ok: false; reason: "not_found"|"invalid_transition"|"slot_conflict"|"link_required" }>` — transaction + `SELECT … FOR UPDATE`; `accept`/`visitor_accept` çakışma yeniden kontrol eder; her geçiş `meeting_request_events` yazar.
  - Kural CRUD: `listRules(expert)`, `createRule(rule)`, `deleteRule(id)`; admin için `listMeetings(filter)`, `updateMeetingDetails(id, { startsAt?, meetingUrl? })` (yalnızca `confirmed`).
  - `meeting-schemas.ts`: zod `requestSchema` (ad 2-100, e-posta, şirket ≤150, rol ≤100, tek satırlık alanlar — `\r\n` yasak, `turnstileToken`), `ruleSchema`.
- [ ] **Step 1:** Failing integration script (`scripts/test-meetings.mjs`, `test-refunds.mjs` kalıbı): çakışan iki talep → ilk `accept` ok, ikinci `slot_conflict`; `declined` sonrası `accept` → `invalid_transition`; süresi dolmuş token → null; `\r\n` içeren ad → şema reddi.
- [ ] **Step 2:** `npm run db:migrate && npm run test:meetings` → FAIL.
- [ ] **Step 3:** Uygula (slot hesapları Task 1 fonksiyonları; DB'den kurallar ve `accepted|confirmed` kayıtlar çekilir).
- [ ] **Step 4:** Script PASS; typecheck temiz.
- [ ] **Step 5:** Commit `feat(meetings): veri katmanı ve entegrasyon testi`.

### Task 3: Mailler ve .ics

**Files:** Modify `src/lib/mail.ts` (mevcut `layout`/`deliver`/`esc` kullanılır; `deliver` ek (`attachments`) desteği alır); Create `src/lib/meeting-ics.ts`, `src/lib/meeting-notify.ts`; Test `src/lib/meeting-ics.test.ts`.

**Interfaces:**
- Produces: `buildIcs(m: { id; startsAt: string; endsAt: string; expertName; meetingUrl: string; attendeeEmail: string; sequence: number; cancelled?: boolean }): string` (RFC 5545, `TZID=Europe/Istanbul`, `UID: meeting-<id>@profect`, güncellemede `SEQUENCE` artar).
  `notifyMeeting(event: "requested"|"decided_accept"|"decided_decline"|"countered"|"confirmed"|"updated"|"cancelled"|"visitor_replied", meetingId: number, baseUrl: string): Promise<void>` — 6 mail türü (uzmana yeni talep + yanıt linki `/gorusme/yanit/<token>`; ziyaretçiye alındı + iptal linki `/gorusme/<token>`; karar; alternatif öneri; davet + `.ics`; güncelleme/iptal), `after()` ile çağrılacak şekilde hata fırlatmaz, loglar.
- [ ] **Step 1:** `meeting-ics.test.ts`: çıktı `BEGIN:VCALENDAR`, `DTSTART;TZID=Europe/Istanbul:20261203T140000`, `URL:`/`LOCATION:` = toplantı linki, iptalde `METHOD:CANCEL`, satır sonları `\r\n`, 75 oktet katlama.
- [ ] **Step 2:** `npm test` → FAIL; **Step 3:** uygula; **Step 4:** PASS + `MAIL_DRY_RUN=true` ile `notifyMeeting` çağrısı konsola yazar (elle kontrol).
- [ ] **Step 5:** Commit `feat(meetings): mailler ve takvim daveti`.

### Task 4: Public API ve ana sayfa bölümü

**Files:** Create `src/app/api/gorusme/slots/route.ts` (GET `?expert&duration&day` → gün listesi veya slotlar), `src/app/api/gorusme/route.ts` (POST talep), `src/components/meetings/ExpertMeetings.tsx` (server, bölüm), `src/components/meetings/MeetingBooking.tsx` (client akış); Modify `src/app/page.tsx` (bölümü kurslar sonrası, kurucular/hakkımızda bloğu yakınına ekle; okunamazsa bölüm gizlenir — `latestPosts` kalıbı), `src/app/globals.css` (yalnızca bölüm stilleri; mevcut kirli değişikliğe dokunma).

**Interfaces:** Consumes Task 2 (`listAvailableDays`, `listSlotsForDay`, `createMeetingRequest`, `requestSchema`), Task 3 (`notifyMeeting("requested", …)`), `verifyTurnstile`, `turnstileSiteKey`, `getCurrentUser` (giriş varsa ad/mail ön doldurma). POST yanıtı: `ok({ id })` / `fail(...)` (409 slot dolu, 429 limit). IP oran sınırı: bellek içi basit sayaç (≤5 POST / 10 dk).
- Bölüm davranışı: sol/sağ fotoğraf (`/images/kaan-tuncbilek.jpeg`, `/images/tugrul.jpeg`); birine hover/focus'ta diğeri `opacity .35` + konu başlıkları görünür (dokunmatikte ilk dokunuşta açılır); tıklayınca süre (15/30) → gün (boş gün listesi) → saat → form (ad soyad, şirket maili, şirket, rol, Turnstile) → gönder; müsaitlik yoksa o uzman için "Yakında" ve form kapalı; başarıda "talebin alındı, mail gönderdik" ekranı.
- [ ] **Step 1:** `scripts/test-meetings.mjs`'e API testi ekle (geçersiz Turnstile 403, slot dışı 409, başarılı 200 ve DB'de `pending`); **Step 2:** FAIL; **Step 3:** uygula (Next 16 route handler/`params: Promise` kalıbı mevcut rotalardan); **Step 4:** PASS + tarayıcıda (dev server) bölüm hover/akış kontrolü, mobil genişlik; **Step 5:** Commit `feat(meetings): ana sayfa bölümü ve talep API'si`.

### Task 5: Uzman ve ziyaretçi yanıt sayfaları

**Files:** Create `src/app/gorusme/yanit/[token]/page.tsx` + `src/components/meetings/ExpertResponse.tsx`, `src/app/gorusme/[token]/page.tsx` + `VisitorResponse.tsx`, `src/app/api/gorusme/[token]/route.ts` (PATCH).

**Interfaces:** Consumes `getMeetingByToken`, `applyMeetingAction`, `notifyMeeting`. PATCH gövdesi zod ile: `{ action: "accept"|"decline"|"counter"|"set_link"|"visitor_accept"|"visitor_decline"|"cancel", startsAt?, meetingUrl?, note? }`; rol token'dan çıkar (uzman tokenı yalnızca uzman aksiyonları, ziyaretçi tokenı yalnızca ziyaretçi aksiyonları); hata eşlemesi: `invalid_transition`→409, `slot_conflict`→409 (uzmana "slot doldu, başka saat öner"), süresi dolmuş token→410. `set_link` yalnızca `https://` URL kabul eder.
- Sayfalar: `noindex`; uzman sayfası talep özetini (ad, şirket, rol, e-posta, süre, saat) + Kabul / Reddet (+not) / Başka saat öner (müsait slot seçici) gösterir; `accepted` durumda toplantı linki alanı; ziyaretçi sayfası durumu gösterir, öneride Kabul/Ret, `pending`/`counter_proposed` iken İptal.
- [ ] **Step 1:** Test script'e ekle: uzman tokenı ile ziyaretçi aksiyonu 403; uzman `accept` → `accepted` → `set_link` → `confirmed`; ret/öneri/ziyaretçi onayı akışı; süresi dolmuş token 410. **Step 2:** FAIL; **Step 3:** uygula, her başarılı geçişte `after(() => notifyMeeting(...))`; **Step 4:** PASS + elle tarayıcı akışı (dry-run mailden link); **Step 5:** Commit `feat(meetings): uzman ve ziyaretçi yanıt akışı`.

### Task 6: Admin "Görüşmeler" ve takvim

**Files:** Modify `src/components/admin/AdminTabs.tsx` (`{ href: "/admin/gorusmeler", label: "Görüşmeler" }`, `Kuponlar` ile `Blog & Haber` arasına); Create `src/app/admin/gorusmeler/page.tsx` (liste + durum/uzman filtre + detay), `src/app/admin/gorusmeler/takvim/page.tsx`, `src/components/admin/MeetingsTable.tsx`, `src/components/admin/AvailabilityCalendar.tsx` (ay görünümü: müsait yeşil, blok kırmızı, toplantılar işaretli; kural ekle formu: uzman, müsait/değil, saat aralığı, tekrar türü, haftalık gün seçimi, bitiş tarihi, not; kural sil), `src/app/api/admin/meetings/[id]/route.ts` (PATCH: `cancel`, `update` → tarih/saat/link), `src/app/api/admin/meeting-rules/route.ts` (GET/POST) ve `[id]/route.ts` (DELETE); hepsi `requireAdmin` (sayfalar layout'taki `requireAdminPage`).

**Interfaces:** Consumes Task 2 CRUD ve `applyMeetingAction` (actor `"admin"`), `updateMeetingDetails`; güncelleme/iptal sonrası `notifyMeeting("updated"|"cancelled", …)` (`.ics` `sequence` artar).
- [ ] **Step 1:** Test script'e: admin olmayan 401/403; `update` yalnızca `confirmed`'da; iptal sonrası slot tekrar boşalır (`listSlotsForDay` içerir); çakışan yeni saat 409. **Step 2:** FAIL; **Step 3:** uygula (mevcut admin stil kalıpları `RefundsTable`, `CouponsPanel`); **Step 4:** PASS + tarayıcıda takvim/kural/liste kontrolü; **Step 5:** Commit `feat(meetings): admin görüşmeler ve müsaitlik takvimi`.

### Task 7: Uçtan uca doğrulama

- [ ] `npm test && npm run typecheck && npm run test:meetings && npm run build` hepsi başarılı (build migration'ı da çalıştırır).
- [ ] Dev server + `MAIL_DRY_RUN=true`: admin takvime müsait kural ekle → ana sayfadan talep → konsol maillerindeki linkle uzman kabul + link gir → ziyaretçi davet mailinde `.ics` → admin'den saat güncelle ve iptal; her adımda ziyaretçi maili konsolda görülür.
- [ ] `superpowers:verification-before-completion` ile sonuçları raporla; PR/merge kararı kullanıcıya bırakılır.

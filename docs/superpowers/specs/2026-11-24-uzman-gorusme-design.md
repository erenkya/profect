# Uzmanlarla Görüşme (Kaan Tunçbilek & Tuğrul Günal) — Tasarım

## Amaç ve neden
Ana sayfadaki bir bölümden ziyaretçiler iki kurucu uzmanla (Tuğrul Günal: tedarik zinciri, liderlik, eğitim; Kaan Tunçbilek: yapay zekâ, teknoloji, satış-pazarlama) en fazla 30 dk'lık tanışma/danışma görüşmesi talep eder. Talep uzmana mail ile gider, uzman site içinden kabul/ret/alternatif saat önerir, kabulde toplantı linkini girer; ziyaretçi her adımda mail ile bilgilendirilir. Amaç: potansiyel (kurumsal) müşterilerle sürtünmesiz, kayıt altında bir görüşme akışı.

## Hedefler
- Ana sayfada iki fotoğraflı (sol/sağ) bölüm. Birine hover'da diğeri silikleşir, hover'daki uzmanın konu başlıkları görünür. Tıklayınca talep akışı açılır.
- Akış: süre (15/30 dk) → gün → saat → ad soyad, şirket maili, şirket, rol → Turnstile → gönder.
- Uzman, mailden **girişsiz** tek kullanımlık-güvenli token linkiyle yanıt verir: kabul / reddet / başka saat öner.
- Müsaitlik takvimi: admin her uzman için "müsait" ve "müsait değil" kurallarını tek seferlik, günlük, haftalık (gün seçimli) veya aylık tekrarla girer; ay görünümlü takvim.
- Admin "Görüşmeler" sekmesi: liste/filtre, detay, saat/tarih/link güncelleme, iptal. Her değişiklikte ziyaretçiye mail.
- Onayda ziyaretçiye toplantı linki + `.ics` takvim eki içeren davet maili.

## Hedef dışı
- Ödeme, Google/Outlook takvim entegrasyonu ve otomatik toplantı linki üretimi (link elle girilir).
- Üyelik zorunluluğu (giriş şart değil; girişliyse ad/mail önceden doldurulur).
- Ziyaretçi için ayrı hesap/panel (yalnızca tokenlı link).
- Çoklu dil, saat dilimi seçimi (Europe/Istanbul sabit).

## Kısıtlar / mevcut yapı
- Next.js 16.4.6 (AGENTS.md: kodu yazmadan önce `node_modules/next/dist/docs/` okunacak), MySQL (`mysql2`, `db/migrations/029_*.sql`, idempotent stil), nodemailer/Gmail (`src/lib/mail.ts`, `deliver`, `MAIL_DRY_RUN`), Turnstile (`src/lib/turnstile.ts`), token üretimi `src/lib/tokens.ts` (ham token mailde, DB'de SHA-256).
- Admin koruması `requireAdminPage`; sekmeler `AdminTabs.tsx`.
- Uzman bildirim adresleri: Kaan `kaan.tuncbilek@xellence.com.tr`, Tuğrul `tugrul@tugrulgunaldanismanlik.com` (kodda sabit; uzman kayıtları `src/data` içinde, fotoğraflar `public/images/`).

## Yaklaşımlar
1. **Kural tabanlı müsaitlik (seçildi).** Kurallar saklanır; boş slotlar istek anında hesaplanır: müsait kurallar − "müsait değil" kuralları − kabul edilmiş toplantılar. Tekrarlar sonsuz üretilmeden çözülür, kural ekleme/silme kolay, çakışmada "müsait değil" kazanır.
2. Önceden üretilmiş slot satırları. Reddedildi: sonsuz tekrar üretilemez, kural değişince yeniden üretim gerekir, gereksiz karmaşık.
3. Serbest saat girişi. Reddedildi: uygunsuz/çakışan talepler artar.

## Tasarım
**Veri (migration 029):**
- `expert_availability_rules`: expert (`kaan`|`tugrul`), `kind` (`available`|`blocked`), `start_time`/`end_time`, `recurrence` (`once`|`daily`|`weekly`|`monthly`), `date` (once için), `weekdays` (weekly için bitmask), `starts_on`, `until` (opsiyonel), `note`.
- `meeting_requests`: id, expert, `duration_min` (15|30), `starts_at`/`ends_at`, ad soyad, e-posta, şirket, rol, `user_id` (opsiyonel), `status` (`pending`, `counter_proposed`, `accepted`(link bekliyor)/`confirmed`, `declined`, `cancelled`), `proposed_starts_at`, `meeting_url`, uzman ve ziyaretçi için token özetleri + son kullanma, `decision_note`, zaman damgaları. Durum geçişleri tek yerde (saf kural modülü + test).
- `meeting_request_events`: değişiklik geçmişi (kim, ne, ne zaman).

**Akış:** `pending` → uzman: kabul → `accepted` (link girilene kadar) → link girilince `confirmed` + davet mailı (.ics) | reddet → `declined` | öner → `counter_proposed` → ziyaretçi linkten kabul → `accepted` / ret → `declined`. Ziyaretçi `pending`/`counter_proposed` iken iptal edebilir; admin her zaman iptal edebilir. Tarih/saat/link güncellemesi `confirmed` kayıtta admin'den yapılır ve ziyaretçiye "güncellendi" maili (.ics güncel) gider.

**Slot kuralları:** 30 dk adımla başlar; en erken +24 saat, en geç +60 gün; bekleyen talep slotu kilitlemez, kabulde çakışma yeniden kontrol edilir (işlem içinde, çakışırsa hata/yeni öneri); `accepted`/`confirmed` slotu kapatır. Müsaitlik hiç yoksa bölüm "yakında" der.

**Güvenlik:** Turnstile, aynı e-postaya günlük talep sınırı, aynı IP'ye kısa süreli oran sınırı, token 30 gün geçerli (ham token yalnızca mailde), her geçerli e-posta kabul edilir (ücretsiz sağlayıcılar dahil; eleme uzmanın reddetme yetkisiyle yapılır), tüm kullanıcı metinleri mailde kaçışlanır.

**Mailler (6):** uzmana yeni talep (yanıt linki) · ziyaretçiye "talebin alındı" (iptal linki) · ziyaretçiye karar (kabul/ret, link bekleniyor bilgisi) · ziyaretçiye alternatif saat önerisi (kabul/ret linki) · ziyaretçiye davet (link + .ics) · ziyaretçiye güncelleme/iptal. Uzmana ziyaretçi öneri yanıtı ve iptal bildirimi.

**UI:** ana sayfada `ExpertMeetings` bölümü + istemci akış bileşeni; yanıt sayfaları `/gorusme/yanit/[token]` (uzman) ve `/gorusme/[token]` (ziyaretçi); admin: `/admin/gorusmeler` (liste+detay) ve takvim/kural yönetimi (`/admin/gorusmeler/takvim`); API `src/app/api/gorusme/*` ve `src/app/api/admin/meetings/*`.

## Builder'a bırakılanlar
Tam bileşen/dosya düzeni, görsel detay (mevcut tasarım sistemi `ds.css` ile uyumlu), slot hesaplayıcısı için saf fonksiyon + birim testleri (`src/lib/*.test.ts` stili), takvim bileşeninin ayrıntıları, oran sınırı uygulaması.

## Benim varsayımlarım (itiraz edilebilir)
- Saat dilimi sabit Europe/Istanbul; süre seçenekleri 15 ve 30 dk; slot adımı 30 dk; +24 saat / 60 gün penceresi.
- Bekleyen talep slotu kilitlemez; kabulde çakışma kontrol edilir.
- Link süresi 30 gün; ziyaretçi bekleyen talebini iptal edebilir.
- (Karar) Ücretsiz mail adresleri (gmail vb.) de talep gönderebilir; gerekirse uzman reddeder.
- Ana sayfada bölümün yeri: kurucular/hakkımızda bloğuna yakın, kurs listesinden sonra.

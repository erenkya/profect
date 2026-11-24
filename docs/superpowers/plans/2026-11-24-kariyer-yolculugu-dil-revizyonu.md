# Kariyer Yolculuğu Dil Revizyonu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Profect'in görünen dilini "klasik eğitim platformu"ndan "kariyer yolculuğu"na çevirmek; tasarım kimliği ve tüm işlevler aynı kalır.

**Architecture:** Önce yeni içerik verisi (`src/data/journey.ts`, birim testli), sonra menü/alt bilgi, ana sayfa bölümleri, ardından tanıtım dilindeki sayfa grupları sırayla güncellenir. Rotalar, DB, API ve işlem (satın alma) dili dokunulmaz.

**Tech Stack:** Next.js 16.4.6 (App Router), React 19, TypeScript, lucide-react, mevcut `ds.css`/`globals.css` sınıfları, `node --test` (`src/lib/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-24-kariyer-yolculugu-dil-revizyonu-design.md`

## Global Constraints

- **Tasarım kimliği değişmez (kullanıcı talimatı):** yeni renk, font, token, koyu tema yok. Yeni bölümler yalnızca mevcut sınıfları (`wrap`, `section-pad`, `eyebrow`, `h-section`, `card`, `blueprint`, `tag`, `btn btn-primary/secondary`, `Corners`, `data-reveal`) ve `--color-*`/`--muted-*` değişkenlerini kullanır. İstisna: hero başlığının font boyutu, yeni cümle sığsın diye küçültülebilir (aile/ağırlık aynı).
- **İşlev kaybı yok:** rota (`/kurslar`, `/programlar`, `/hesabim/kurslarim`, `/sertifika/[code]`), DB, API, kod adları, anchor'lar (`#nasil`, `#uzman-gorusme`), erişilebilirlik etiketleri ve mevcut linklerin hepsi çalışmaya devam eder.
- **Tanıtım dili → yeni terimler:** kurs→eğitim, program→uzmanlık alanı; Kurslarım→Eğitimlerim, Programlarım→Uzmanlık Alanlarım.
- **İşlem dili → eski terimler kalır:** sepet, ödeme, ödeme sonucu, sipariş, iade/iptal, sipariş/hediye e-postaları, hediye satın alma ve kabul, `PurchasePanel`, `ProgramPricePanel`, sertifika PDF'i ve doğrulama sayfası, `ITEM_TYPE` etiketleri, API hata mesajları, şirket paneli. "Uzmanlık Programı Sertifikası" aynen kalır.
- **Hiç dokunulmayanlar:** hukuki metinler (mesafeli satış, iade-iptal, KVKK, gizlilik, çerez, içerik bildirimi), `/admin/*`, `/egitmen/*`, DB'deki kurs/program/blog içeriği.
- **İngilizce sloganlar kalır:** "Perfect Your Profession.", "Knowledge → Decision → Impact", "Learn from people who've actually done it."; altlarında Türkçe destek satırı.
- **Üçüncü taraf içerik gösterilmez** (logo dosyası, kurucu alıntısı) onaylı veri girilene kadar.
- Next.js 16: kod yazmadan önce `node_modules/next/dist/docs/` içinde ilgili rehber (client component, `Link`, `metadata`) okunur (AGENTS.md).

## Review Focus

1. Logo listesi boşken referans bölümü hiç render edilmez, boş başlık kalmaz → Task 1 testi.
2. Kurucu alıntısı girilmemişken alıntı arayüzü yok, mevcut bio özeti görünür → Task 1 testi.
3. "Kaynaklar" alt menüsünde `/blog` ve `/haberler` klavye (Tab/Escape), mobil menü ve `aria-current` ile erişilebilir → Task 2.
4. `/ogrenim/*/ders/*` sayfasında Nav ve Footer hâlâ gizli → Task 2.
5. "Kurumsal" ve "Nasıl çalışır" anchor'ları başka sayfadan (`/#uzman-gorusme`) tıklanınca ana sayfada ilgili bölüme iner → Task 2, 4.

---

### Task 1: Yolculuk içerik verisi ve testleri

**Files:**
- Create: `src/data/journey.ts`
- Create: `src/lib/journey-data.test.ts`
- Modify: `src/data/courses.ts` (`STEPS`, `FOUNDERS`)

**Interfaces:**
- Produces (`src/data/journey.ts`, hiçbir `@/` import'u yok, test `./` ile import edebilsin):
  - `STAGES: readonly { key: "bilgi"|"karar"|"etki"; en: string; tr: string }[]` → Knowledge/Bilgi, Decision/Karar, Impact/Etki
  - `AGENDA: readonly { id: string; label: string; icon: "trending-down"|"shield-check"|"users"|"sparkles"|"target"|"bar-chart" }[]` (6 öğe)
  - `AGENDA_HREF = "/kurslar"`
  - `FOUNDER_QUOTES: Record<string, string>` (anahtar `FOUNDERS[].n`; başlangıçta `{}`)
  - `REFERENCE_LOGOS: { name: string; src: string; width: number; height: number }[]` (başlangıçta `[]`)
  - `quoteFor(n: string): string | null`; `hasReferences(list?: typeof REFERENCE_LOGOS): boolean`
- Consumes: yok. `STEPS`/`FOUNDERS` `courses.ts`'te kalır, yalnızca metinleri değişir.

- [ ] **Step 1: Spec'i commit et** — `git add docs/superpowers && git commit -m "docs: kariyer yolculuğu dil revizyonu tasarım ve plan"`.
- [ ] **Step 2: Failing test yaz** (`src/lib/journey-data.test.ts`, `node:test` + `./../data/journey.ts` import):
  - `STAGES` sırası `["bilgi","karar","etki"]`, `en` değerleri `["Knowledge","Decision","Impact"]`.
  - `AGENDA.length === 6`; etiketler mockup'taki gibi: "Maliyetleri düşürmek", "Tedarikçi riskini yönetmek", "Daha iyi müzakere etmek", "AI'ı işimde kullanmak", "Stratejik karar almak", "Veriden daha iyi yararlanmak"; `id`'ler benzersiz; `AGENDA_HREF === "/kurslar"`.
  - `quoteFor("01") === null` (onaysız alıntı yayına girmez); `hasReferences() === false`; `hasReferences([{name:"x",src:"/x.svg",width:10,height:10}]) === true`.
- [ ] **Step 3:** `npm test` → FAIL ("journey.ts bulunamadı").
- [ ] **Step 4: `journey.ts`'i yaz**: yukarıdaki imzalarla; `quoteFor` boş/boşluk metni `null` sayar.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: `courses.ts` metinleri.** `STEPS` Bilgi → Karar → Etki olur (rotalar/`n`/`color`/`delay` aynı): 
  - 01 "Bilgi": video ders, okuma, vaka ve uygulamalı ödev; kaldığın yerden devam. Tags `["Video","Okuma","Vaka"]`.
  - 02 "Karar": modül ve final sınavlarıyla kendini sına, sonucu anında gör. Tags `["Modül sınavı","Final sınavı","Anında sonuç"]`.
  - 03 "Etki": geçtiğinde benzersiz numaralı, QR kodla doğrulanabilir sertifikan hesabına eklenir, LinkedIn'de paylaşılır. Tags `["QR doğrulama","LinkedIn","PDF"]`.
  - `FOUNDERS[].short`/`bio`/`photo`/`linkedin` değişmez.
- [ ] **Step 7:** `npm run typecheck` → hatasız. Commit: `feat(home): yolculuk içerik verisi (aşamalar, gündem, referans, alıntı)`.

### Task 2: Menü ve alt bilgi

**Files:**
- Modify: `src/components/Nav.tsx`, `src/components/Footer.tsx`, `src/app/globals.css` (yalnız alt menü için gerekirse mevcut `.nav-link`/`.pm-item` kalıbını izleyen birkaç kural)

**Interfaces:** Consumes: yok. Produces: yok.

- [ ] **Step 1:** `Nav.tsx`: `nav-menu` sırası **Eğitimler** (`/kurslar`, `aria-current` `onCourses`) · **Uzmanlık Alanları** (`/programlar`) · **Kurumsal** (`/#uzman-gorusme`) · **Hakkımızda** (`/hakkimizda`) · **Kaynaklar**. `/#sertifika` linki silinir. `Kaynaklar` Blog (`/blog`) ve Haberler (`/haberler`) içeren bir alt menü (butona tıkla/odakla aç, `Escape` ve dışa tıklayınca kapan, `aria-expanded`, `aria-current` mevcut `onBlog`/`onNews`); mobil `nav-burger` menüsünde iki link doğrudan alt alta listelenir. Giriş Yap / Kayıt Ol / sepet / profil / ders sayfasında gizlenme (`/^\/ogrenim\/[^/]+\/ders\//`) aynen kalır.
- [ ] **Step 2:** `Footer.tsx` "Platform" sütunu: Eğitimler (`/kurslar`), Uzmanlık Alanları (`/programlar`), Blog, Haberler. "Şirket" sütunu ve hukuki linkler aynı.
- [ ] **Step 3:** `npm run typecheck`; `npm run dev` ile `/` ve `/kurslar`'da menü: Kaynaklar açılıp kapanıyor, iki link çalışıyor, mobil genişlikte (≤ burger eşiği) çalışıyor, Tab/Escape ile erişilebiliyor, bir ders sayfasında menü yok. Beklenen: hepsi geçer.
- [ ] **Step 4:** Commit: `feat(nav): eğitimler/uzmanlık alanları/kurumsal/kaynaklar menüsü`.

### Task 3: Ana sayfa hero ve aşama şeridi

**Files:**
- Create: `src/components/home/StageStrip.tsx`
- Modify: `src/app/page.tsx` (hero bölümü, ~satır 55–143), `src/components/Cta.tsx`

**Interfaces:** Consumes: `STAGES` (Task 1). Produces: `StageStrip(): JSX.Element` (props yok).

- [ ] **Step 1:** `StageStrip.tsx`: `STAGES`'i "KNOWLEDGE → DECISION → IMPACT" şeklinde `eyebrow` stilinde yan yana, mobilde sarılan satır olarak çizer (ok için lucide `ArrowRight`); her aşamanın altında/yanında küçük Türkçe karşılığı (Bilgi/Karar/Etki). `data-reveal` kullanır.
- [ ] **Step 2:** Hero metinleri (`page.tsx`): kicker "Perfect Your Profession." (eski uzun kicker kalkar); `h1` "Mesleğiniz değişiyor." + satır sonu + "Siz ne kadar hazırsınız?" (ikinci satır `var(--color-accent)`); font boyutu `clamp(40px,5.6vw,84px)`; alt metin: "Gerçek iş deneyimiyle geliştirilmiş eğitimler. Güncel bilgi. Uygulanabilir modeller. Yeni nesil öğrenme."; birincil buton "Keşfetmeye Başla" (`/kurslar`, mevcut `btn btn-primary blueprint` + `Corners`); ikincil "Nasıl çalışır?" (`#nasil`) aynen; butonların altında `<StageStrip />`.
- [ ] **Step 3:** Sağ kompozisyon kartları yalnızca metin: "Modül 3 / 6" kartı → "Yol haritan · Modül 3 / 6"; "Final Sınavı / Geçti" → "Yetkinlik değerlendirmesi / Geçti"; "Sertifikan hazır" → "Sertifikan hazır · yolculuğunun kanıtı" (`DEMO_CERT.number` aynı). `HeroSlides` ve görseller aynı.
- [ ] **Step 4:** `Cta.tsx`: başlık "Bir sonraki adımın bir eğitim uzağında"; alt metin "Ücretsiz hesap aç, istediğin eğitimin ilk modülünü hemen izlemeye başla."; buton "Eğitimleri incele" (`/kurslar`).
- [ ] **Step 5:** `npm run typecheck`; `/` açılır, hero görünür, 375px genişlikte yatay taşma yok. Commit: `feat(home): kariyer yolculuğu hero ve aşama şeridi`.

### Task 4: Gündem, nasıl çalışır, kurucular, referans bölümleri

**Files:**
- Create: `src/components/home/AgendaGrid.tsx`, `src/components/home/ReferenceStrip.tsx`
- Modify: `src/app/page.tsx` (founders, how-it-works, yeni bölüm yerleşimi)

**Interfaces:** Consumes: `AGENDA`, `AGENDA_HREF`, `quoteFor`, `REFERENCE_LOGOS`, `hasReferences` (Task 1). Produces: `AgendaGrid()`, `ReferenceStrip()` (`hasReferences()` yanlışsa `null` döner).

- [ ] **Step 1:** `AgendaGrid.tsx`: eyebrow "Şu anda profesyonellerin çözmeye çalıştığı problemler", `h2.h-section` "Bunlardan hangisi sizin gündeminizde?"; `AGENDA` 6 kartı mevcut `card` stiliyle, lucide ikonları (`TrendingDown`, `ShieldCheck`, `Users`, `Sparkles`, `Target`, `BarChart3`), her kart `Link href={AGENDA_HREF}`; mobilde 2 sütun/tek sütun kırılır.
- [ ] **Step 2:** `page.tsx` sırası: Hero → `AgendaGrid` → Founders → Marquee → "Nasıl çalışır" → ReferenceStrip → Öne çıkan eğitimler → Uzmanlık alanları → Uzman görüşmesi → Blog/Haber. Bölüm numaraları (`01 —` …) bu sıraya göre yeniden numaralanır.
- [ ] **Step 3:** Kurucular bölümü: eyebrow "Gerçek deneyim. Gerçek sonuçlar."; `h2` "Learn from people who've actually done it."; altında dört kısa satır "Teori değil. Gerçek kararlar. Gerçek problemler. Gerçek deneyim."; kurucu başına `f.short` aynen; `quoteFor(f.n)` doluysa kısa alıntı (italik değil, mevcut `p` stili) ve boşsa hiçbir şey; "Hikâyeyi oku" → `/hakkimizda`; LinkedIn butonları kalır. Fotoğraf/animasyon/`founders-stage` yapısı aynı.
- [ ] **Step 4:** "Nasıl çalışır": `#nasil` kalır; eyebrow "Nasıl çalışır", başlık "Bilgiden etkiye üç adım", yan metin "Her eğitim aynı yapıyı izler: bilgi, karar ve etki. Ne öğrendiğini bilirsin, kanıtlayabilirsin."
- [ ] **Step 5:** `ReferenceStrip.tsx`: "Deneyimimiz, gücümüz" eyebrow'u ve `next/image` ile logo satırı (`REFERENCE_LOGOS`); liste boşken `null`.
- [ ] **Step 6:** `npm run typecheck`; `/`'da gündem kartı tıklanınca `/kurslar`'a gidiyor, referans bölümü görünmüyor (liste boş), kurucu alıntısı yok, `#nasil` anchor'ı çalışıyor, `/kurslar` sayfasından menüden "Kurumsal" `/` üzerinde `#uzman-gorusme`'ye iniyor. Commit: `feat(home): gündem, yolculuk adımları, kurucular ve referans bölümleri`.

### Task 5: Ana sayfanın kalan bölümleri

**Files:**
- Modify: `src/app/page.tsx` (öne çıkan eğitimler, uzmanlık alanları), `src/components/meetings/ExpertMeetings.tsx`, `src/components/posts/HomePosts.tsx`, `src/components/posts/PostsIndex.tsx`, `src/app/blog/page.tsx`, `src/app/haberler/page.tsx`

**Interfaces:** Consumes/Produces: yok.

- [ ] **Step 1:** Öne çıkan eğitimler: eyebrow "Öne çıkan eğitimler", başlık "Yolculuğuna değer katan eğitimler", buton "Tüm eğitimler". Uzmanlık alanları: eyebrow "Uzmanlık alanları", başlık "Bir alanda derinleş: eğitimleri tek yolculukta topla", buton "Tüm uzmanlık alanları".
- [ ] **Step 2:** `ExpertMeetings.tsx`: eyebrow "Kurumsal ve bireysel görüşme"; başlık "Kurucularımızla 30 dakikalık bir görüşme planlayın" aynen; alt metin "Kendiniz ya da ekibiniz için konunuza uygun uzmanı seçin; gün ve saati bir sonraki adımda belirleyin." Akış, `id="uzman-gorusme"` ve kart yapısı aynı.
- [ ] **Step 3:** Blog/haber başlık ve eyebrow'larında "kurs" geçiyorsa tablo kuralıyla düzelt; içerik (DB) aynı.
- [ ] **Step 4:** `npm run typecheck`; `/` boyunca elle tarama. Commit: `feat(home): kalan ana sayfa bölümleri yeni dilde`.

### Task 6: Liste ve detay sayfaları (tanıtım dili)

**Files (yalnızca başlık, anlatı, eyebrow, boş durum, meta; işlem etiketleri kalır):**
- Modify: `src/app/kurslar/page.tsx`, `src/app/kurslar/[slug]/page.tsx`, `src/app/programlar/page.tsx`, `src/app/programlar/[slug]/page.tsx`, `src/components/CourseCard.tsx`, `src/components/ProgramCard.tsx`, `src/components/CourseInPrograms.tsx`, `src/components/Curriculum.tsx`
- **Dokunma:** `PurchasePanel.tsx`, `ProgramPricePanel.tsx`, `JoinProgramButton.tsx`, `hediye-et/*`, `components/checkout/*`.

- [ ] **Step 1:** `/kurslar`: başlık "Tüm eğitimler", eyebrow "Katalog" aynı, açıklama "Her eğitim modül sınavları ve bir final sınavıyla biter. Geçtiğinde sertifikan otomatik olarak düzenlenir.", programlara köprü "Birkaç eğitimi birden mi istiyorsun? Uzmanlık alanlarına göz at →".
- [ ] **Step 2:** `/programlar`: başlık "Uzmanlık alanları", eyebrow "Yol haritaları", açıklama "Bir alanda derinleşmek için eğitimleri tek yolculukta topla: ayrı ayrı almaktan daha uygun, hepsini bitirince program sertifikası.", boş durum "Şu an yayında uzmanlık alanı yok. Yakında burada olacak."
- [ ] **Step 2b:** Detay sayfaları (`kurslar/[slug]`, `programlar/[slug]`) ve kartlar: kicker/başlık/anlatı → tablo; fiyat, sepet, katıl, hediye butonları ve işlem etiketleri aynı.
- [ ] **Step 3:** Her dosyada `grep -nE "[Kk]urs|[Pp]rogram" <dosya>` çıktısı gözden geçirilir; kalanlar yalnızca işlem dili/identifier ise bırakılır. `npm run typecheck`; `/kurslar`, bir eğitim detayı, `/programlar`, bir uzmanlık alanı detayı açılır, "Sepete ekle" ve "Programa katıl" (görünürse) çalışır. Commit: `feat(catalog): liste ve detay sayfaları yeni dilde`.

### Task 7: Hesap, giriş/kayıt, hakkımızda, çerçeve metinleri

**Files:**
- Modify: `src/components/account/items.ts`, `src/app/hesabim/page.tsx`, `src/app/hesabim/kurslarim/page.tsx`, `src/app/hesabim/programlarim/page.tsx`, `src/components/account/MyCourseCard.tsx`, `src/app/giris/page.tsx`, `src/app/kayit/page.tsx`, `src/components/auth/RegisterForm.tsx` (görünen metin varsa), `src/app/hakkimizda/page.tsx`, `src/app/not-found.tsx`, `src/app/ogrenim/[slug]/page.tsx`, `src/app/ogrenim/[slug]/layout.tsx`, `src/components/learn/CourseSidebar.tsx`
- **Dokunma:** `hesabim/sertifikalarim`, `siparislerim*`, `hediyeler`, iade bölümleri, `QuizPlayer`, `LessonPlayer`, `CertificateButton`, `/sirket/*` (işlem dili).

- [ ] **Step 1:** `items.ts`: "Eğitimlerim" (href `/hesabim/kurslarim` aynı), "Uzmanlık Alanlarım" (href aynı), "Sertifikalarım" aynı. Hesabım sayfalarının başlık ve boş durum metinleri aynı kuralla ("Henüz eğitimin yok. Eğitimleri keşfet →").
- [ ] **Step 2:** Giriş alt metni "Eğitimlerine ve sertifikalarına eriş."; kayıt alt metni "Ücretsiz kaydol, yolculuğunu başlat." (hediye varyantı aynı).
- [ ] **Step 3:** Hakkımızda ana başlık: "Mesleğinizin geleceğine **hazır olmanız** için kurduk" (vurgu span'ı aynı yapı); açıklama metni gerçek deneyim ve kariyer yolculuğu çerçevesinde yeniden yazılır; kurucu bio'ları aynı.
- [ ] **Step 4:** Öğrenim ekranı çerçeve metinleri (sayfa başlıkları, boş durum, kenar çubuğu başlığı): "kurs" → "eğitim"; ders, modül, sınav etiketleri aynı.
- [ ] **Step 5:** `grep` ile kalanları gözden geçir; `npm run typecheck`; girişli hesapla `/hesabim`, Eğitimlerim, Uzmanlık Alanlarım, bir eğitimin `/ogrenim/...` sayfası, `/giris`, `/kayit`, `/hakkimizda`, bilinmeyen URL (404) açılır. Commit: `feat(account): hesap, giriş/kayıt, hakkımızda ve öğrenim çerçevesi yeni dilde`.

### Task 8: Meta metinleri ve son doğrulama

**Files:**
- Modify: `src/app/layout.tsx` (description), `src/app/kurslar/page.tsx`, `src/app/programlar/page.tsx`, `src/app/hakkimizda/page.tsx` (metadata), gerekirse `docs` (yok)

- [ ] **Step 1:** `layout.tsx` description: "Profect'te sektörün uzmanlarınca hazırlanan, güncel ve uygulanabilir eğitimlerle mesleğine hazırlan; final sınavını geç, doğrulanabilir sertifikanı al." Title `default` aynı ("Profect — Perfect Your Profession."). Diğer sayfaların `metadata.title/description` yeni terimlerle (Task 6–7 ile çakışmayanlar). Sertifika sayfası/`opengraph-image` ve e-posta şablonları değişmez.
- [ ] **Step 2: Otomatik doğrulama:** `npm run typecheck`, `npm test`, `npm run build` hepsi hatasız. Beklenen: 0 hata.
- [ ] **Step 3: Terim taraması:** `grep -rniE "kurs|program" src/app src/components --include='*.tsx' | grep -vE "admin|egitmen|kvkk|gizlilik|mesafeli|iade-ve-iptal|cerez|icerik-bildirimi|checkout|Purchase|ProgramPrice|JoinProgram|hediye|sertifika|siparis|sirket|company|api/"` → kalan satırlar yalnızca identifier/import/rota/yorum olmalı; görünen tanıtım metni kalmamalı.
- [ ] **Step 4: Elle uçtan uca:** ana sayfa (masaüstü + 375px), `/kurslar` → eğitim detayı → sepete ekle → sepet/ödeme sayfası eski dille, giriş/kayıt, hesabım, bir hediye linki (`/hediye/[token]` varsa), sertifika doğrulama (`/sertifika/[code]`), uzman görüşmesi planlama (`/gorusme/planla/tugrul`). Beklenen: hepsi açılıyor, işlev değişmedi.
- [ ] **Step 5:** `npm run test:meetings` ve `npm run test:api` (ortamda DB varsa) çalıştır; metne bağlı iddia varsa güncelle. Commit: `chore: meta metinleri ve doğrulama`.

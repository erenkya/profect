export const BLUE = "#3a5fdc";
export const PURP = "#4a2a9e";

export type Course = {
  id: string;
  code: string;
  cat: string;
  title: string;
  inst: string;
  hours: number;
  level: string;
  rating: string;
  price: string;
  oldPrice: string;
  desc: string;
  outcomes: string[];
  mods: string[];
};

export const COURSES: Course[] = [
  { id: "veri", code: "PRF-101", cat: "Veri Bilimi", title: "Veri Analitiğine Giriş", inst: "Dr. Selin Aksoy", hours: 24, level: "Başlangıç", rating: "4.8", price: "₺1.490", oldPrice: "₺2.290",
    desc: "Veriyi toplamaktan görselleştirmeye kadar bir analistin günlük işini adım adım öğren. Excel, SQL ve temel istatistikle gerçek iş sorularına cevap ver.",
    outcomes: ["Veri setlerini temizleyip analize hazırlamak", "SQL ile sorgu yazmak ve tabloları birleştirmek", "Pivot tablolar ve temel istatistikle içgörü çıkarmak", "Bulgularını anlaşılır grafiklerle sunmak"],
    mods: ["Analitik düşünce", "Excel ile veri hazırlama", "Pivot tablolar", "SQL temelleri", "Temel istatistik", "Görselleştirme ve raporlama"] },
  { id: "python", code: "PRF-114", cat: "Yazılım", title: "Python ile Programlamanın Temelleri", inst: "Mert Demirel", hours: 32, level: "Başlangıç", rating: "4.9", price: "₺1.690", oldPrice: "₺2.490",
    desc: "Hiç kod yazmamış olsan bile Python ile değişkenlerden fonksiyonlara, dosya işlemlerinden küçük otomasyonlara kadar sağlam bir temel kur.",
    outcomes: ["Python sözdizimini ve veri tiplerini kullanmak", "Fonksiyon ve modüllerle düzenli kod yazmak", "Dosya ve API ile çalışmak", "Küçük otomasyon projeleri geliştirmek"],
    mods: ["Kurulum ve ilk program", "Veri tipleri", "Koşullar ve döngüler", "Fonksiyonlar", "Listeler ve sözlükler", "Dosya işlemleri", "Hata yönetimi", "Bitirme projesi"] },
  { id: "proje", code: "PRF-203", cat: "İş & Yönetim", title: "Proje Yönetimi Profesyoneli", inst: "Ayşe Karaca, PMP", hours: 28, level: "Orta", rating: "4.7", price: "₺1.890", oldPrice: "₺2.790",
    desc: "Planlamadan kapanışa proje yaşam döngüsünü, çevik ve klasik yöntemleri öğren; uluslararası sertifikasyon sınavlarına hazırlan.",
    outcomes: ["Kapsam, zaman ve bütçe planı hazırlamak", "Risk ve paydaş yönetimi yapmak", "Scrum ve Kanban ile çevik ekip yönetmek", "Proje raporlaması ve kapanış süreçlerini yürütmek"],
    mods: ["Proje yaşam döngüsü", "Kapsam ve planlama", "Zaman ve maliyet", "Risk yönetimi", "Çevik yöntemler", "Paydaş iletişimi", "Sınav hazırlığı"] },
  { id: "ux", code: "PRF-152", cat: "Tasarım", title: "UX Tasarım: Araştırmadan Prototipe", inst: "Deniz Öztürk", hours: 20, level: "Başlangıç", rating: "4.8", price: "₺1.390", oldPrice: "₺1.990",
    desc: "Kullanıcı araştırması, bilgi mimarisi ve prototipleme ile bir ürünün deneyimini baştan sona tasarla, portföyüne bir vaka çalışması ekle.",
    outcomes: ["Kullanıcı görüşmeleri planlayıp yürütmek", "Persona ve kullanıcı yolculuğu çıkarmak", "Wireframe ve etkileşimli prototip hazırlamak", "Kullanılabilirlik testi yapmak"],
    mods: ["UX nedir", "Kullanıcı araştırması", "Bilgi mimarisi", "Wireframe", "Prototip ve test"] },
  { id: "pazarlama", code: "PRF-231", cat: "Pazarlama", title: "Dijital Pazarlama ve Performans Analizi", inst: "Can Yıldız", hours: 18, level: "Orta", rating: "4.6", price: "₺1.290", oldPrice: "₺1.890",
    desc: "Arama, sosyal medya ve e-posta kanallarında kampanya kurmayı, bütçe dağıtmayı ve sonuçları ölçerek optimize etmeyi öğren.",
    outcomes: ["Kanal bazlı pazarlama stratejisi kurmak", "Reklam kampanyası oluşturup yönetmek", "Dönüşüm hunisini analiz etmek", "Performans raporu hazırlamak"],
    mods: ["Strateji ve hedef kitle", "Arama motoru pazarlaması", "Sosyal medya reklamları", "E-posta ve otomasyon", "Ölçümleme ve raporlama"] },
  { id: "finans", code: "PRF-305", cat: "Finans", title: "Finansal Modelleme ve Değerleme", inst: "Burak Şen, CFA", hours: 30, level: "İleri", rating: "4.9", price: "₺2.190", oldPrice: "₺3.190",
    desc: "Üç tablo modelinden indirgenmiş nakit akışına kadar profesyonel finansal modeller kur, şirket değerlemesi yap.",
    outcomes: ["Üç tablo finansal model kurmak", "İndirgenmiş nakit akışı ile değerleme yapmak", "Senaryo ve duyarlılık analizi hazırlamak", "Yatırım sunumu oluşturmak"],
    mods: ["Finansal tablolar", "Model mimarisi", "Gelir ve gider projeksiyonu", "Nakit akışı", "DCF değerleme", "Çarpan analizi", "Senaryo analizi"] },
];

export const CATEGORIES = ["Tümü", ...Array.from(new Set(COURSES.map((c) => c.cat)))];

export const MARQUEE = ["Veri Bilimi", "Yazılım", "Proje Yönetimi", "Tasarım", "Pazarlama", "Finans", "Yapay Zekâ", "Liderlik"];

export const courseColor = (i: number) => (i % 2 ? PURP : BLUE);
export const courseDelay = (i: number) => (i % 3) * 120;

export const getCourse = (id: string) => COURSES.find((c) => c.id === id);

export const EXAM_RULES = [
  { k: "Modül sınavları", v: "10 soru", d: "Her modülün sonunda konuyu pekiştiren kısa değerlendirme.", c: BLUE },
  { k: "Final sınavı", v: "40 soru", d: "60 dakika süreli, tüm modülleri kapsayan sınav.", c: BLUE },
  { k: "Geçme notu", v: "%70", d: "Geçemezsen 24 saat sonra bir hakkın daha olur.", c: PURP },
  { k: "Sertifika", v: "QR", d: "Benzersiz numaralı, çevrimiçi doğrulanabilir belge.", c: PURP },
];

export const STEPS = [
  { n: "01", title: "Kursa kaydol", color: BLUE, delay: 0, body: "Video dersler, okumalar ve uygulamalı ödevlerle konuyu kendi hızında çalış. İlerlemen her cihazda kaldığın yerden devam eder.", tags: ["Video", "Okuma", "Proje"] },
  { n: "02", title: "Sınavlara gir", color: BLUE, delay: 150, body: "Her modülün sonunda kısa bir değerlendirme, kursun sonunda kapsamlı bir final sınavı seni bekler. Sonuçlarını anında görürsün.", tags: ["Modül sınavı", "Final", "%70 geçme"] },
  { n: "03", title: "Sertifikanı al", color: PURP, delay: 300, body: "Final sınavını geçtiğinde benzersiz numaralı, QR kodla doğrulanabilir sertifikan hesabına eklenir ve LinkedIn’de paylaşılabilir.", tags: ["QR doğrulama", "LinkedIn", "PDF"] },
];

export const FOUNDERS = [
  { n: "01", name: "Ad Soyad", role: "Kurucu Ortak · CEO", color: BLUE, order: 0,
    short: "Eğitim teknolojileri ve ürün yönetimi alanında deneyimli. Profect’in vizyonunu ve büyümesini yönetiyor.",
    bio: "Kurucu ortağın kısa biyografisi buraya gelecek: eğitim geçmişi, önceki deneyimleri ve Profect’i kurma motivasyonu. İki üç cümlelik bir metin bu alan için idealdir.",
    quote: "Bir beceriyi öğrenmek kadar, onu kanıtlayabilmek de önemli." },
  { n: "02", name: "Ad Soyad", role: "Kurucu Ortak · Akademik Direktör", color: PURP, order: 1,
    short: "Müfredat tasarımı ve ölçme-değerlendirme uzmanı. Kursların ve sınavların akademik kalitesinden sorumlu.",
    bio: "İkinci kurucu ortağın kısa biyografisi buraya gelecek: akademik geçmişi, uzmanlık alanı ve Profect’teki rolü. Kurs ve sınav kalitesine yaklaşımı burada anlatılabilir.",
    quote: "İyi bir sınav, öğrencinin neyi gerçekten öğrendiğini gösterir." },
];

export const PLUS_PRICE = "₺449";

/** Modül başına ders süresi (dk) — tasarımdaki hesapla aynı. */
export const minutesPerModule = (c: Course) => Math.round((c.hours * 60) / c.mods.length);

export type CurriculumItem = { t: string; d: string; c: string };
export type CurriculumModule = { n: string; title: string; meta: string; items: CurriculumItem[] };

export function buildCurriculum(c: Course): CurriculumModule[] {
  const per = minutesPerModule(c);
  const mods = c.mods.map((title, i) => ({
    n: String(i + 1).padStart(2, "0"),
    title,
    meta: `${4 + (i % 3)} ders · ${per} dk`,
    items: [
      { t: "Video dersler", d: `${per - 20} dk`, c: BLUE },
      { t: "Okumalar ve kaynaklar", d: "3 kaynak", c: BLUE },
      { t: "Uygulamalı ödev", d: "1 proje", c: BLUE },
      { t: "Modül sınavı", d: "10 soru", c: PURP },
    ],
  }));
  mods.push({
    n: "◆",
    title: "Final sınavı ve sertifika",
    meta: "40 soru · 60 dk",
    items: [
      { t: "Final sınavı", d: "40 soru · 60 dk", c: PURP },
      { t: "Sonuç ve geri bildirim", d: "Anında", c: PURP },
      { t: "Sertifika düzenleme", d: "%70 ve üzeri", c: PURP },
    ],
  });
  return mods;
}

export const INCLUDES = (c: Course) => [
  `${c.hours} saat video ders`,
  `${c.mods.length} modül sınavı + final sınavı`,
  "Doğrulanabilir sertifika",
  "Ömür boyu erişim",
  "Mobil ve masaüstü",
];

export const DEMO_CERT = {
  number: "PRF-2026-08431",
  holder: "Elif Yılmaz",
  course: "Veri Analitiğine Giriş",
  date: "12.09.2026",
};

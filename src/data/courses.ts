export const BLUE = "#3a5fdc";
export const PURP = "#4a2a9e";

export const MARQUEE = ["Veri Bilimi", "Yazılım", "Proje Yönetimi", "Tasarım", "Pazarlama", "Finans", "Yapay Zekâ", "Liderlik"];

export const courseColor = (i: number) => (i % 2 ? PURP : BLUE);
export const courseDelay = (i: number) => (i % 3) * 120;

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
  { n: "01", name: "Tuğrul Günal", role: "Kurucu Ortak", color: BLUE, order: 0,
    photo: "/images/tugrul.jpeg",
    linkedin: "https://www.linkedin.com/in/tugrul-g%C3%BCnal/",
    short: "36 yıllık deneyimin 31 yılını Siemens’te üst düzey yönetici olarak geçirdi. TEDAR’ın kurucu başkanı ve Tuğrul Günal Danışmanlık’ın kurucusu.",
    bio: "36 yıllık iş deneyiminin 31 yılını Siemens’te Almanya, Avusturya, İsrail, Polonya, Rusya ve Türkiye’de yöneticilik yaparak geçirdi; İnsan Kaynakları, Strateji, Tedarik Zinciri ve Bilgi Teknolojileri birimlerini yönetti. 2013’te Türkiye’nin ilk tedarik zinciri yönetimi derneği TEDAR’ı kurdu ve kurucu başkanı olarak yönetmeye devam ediyor. Bugün Tuğrul Günal Danışmanlık çatısı altında kurumlara liderlik, dönüşüm ve tedarik zinciri stratejisi alanlarında destek veriyor.",
    quote: "Bir beceriyi öğrenmek kadar, onu kanıtlayabilmek de önemli." },
  { n: "02", name: "Kaan Tunçbilek", role: "Kurucu Ortak", color: PURP, order: 1,
    photo: "/images/kaan.jpeg",
    linkedin: "https://www.linkedin.com/in/kaan-tuncbilek/",
    short: "15+ yıllık kurumsal dönüşüm ve yapay zekâ deneyimine sahip. Xellence’ın kurucusu; kurumlara yapay zekâ yol haritası ve dönüşüm danışmanlığı veriyor.",
    bio: "Enerji, sağlık, hızlı tüketim, otomotiv ve altyapı sektörlerinde 15 yılı aşkın süredir dijital dönüşüm ve yapay zekâ benimsenmesi projelerine liderlik etti; 20’den fazla ülkede 475’ten fazla otomasyon ve analitik çözümünü ölçeklendirdi. İTÜ mezunu; Lean Six Sigma Black Belt ve INSEAD İleri Liderlik Programı sertifikalarına sahip. Xellence’ın kurucusu olarak şirketlerin yapay zekâya hazırlığı, yol haritası ve program hızlandırma alanlarında danışmanlık yapıyor.",
    quote: "İyi bir sınav, öğrencinin neyi gerçekten öğrendiğini gösterir." },
];

export const DEMO_CERT = {
  number: "PRF-2026-000000",
  holder: "Elif Yılmaz",
  course: "Veri Analitiğine Giriş",
  date: "12.09.2026",
};

export const BLUE = "#3a5fdc";
export const PURP = "#4a2a9e";
export const INDIGO = "#4244bd"; // BLUE ile PURP arası: adım renk geçişinin ortası

export const courseColor = (i: number) => (i % 2 ? PURP : BLUE);
export const courseDelay = (i: number) => (i % 3) * 120;

export const STEPS = [
  { n: "01", title: "Kursa kaydol", color: BLUE, delay: 0, body: "Video dersler, okumalar ve uygulamalı ödevlerle konuyu kendi hızında çalış. İlerlemen her cihazda kaldığın yerden devam eder.", tags: ["Video", "Okuma", "Proje"] },
  { n: "02", title: "Sınavlara gir", color: INDIGO, delay: 150, body: "Kursun sonunda kapsamlı bir final sınavı seni bekler. Sonuçlarını anında görürsün.", tags: ["Final sınavı", "Anında sonuç", "Sertifika"] },
  { n: "03", title: "Sertifikanı al", color: PURP, delay: 300, body: "Final sınavını geçtiğinde benzersiz numaralı, QR kodla doğrulanabilir sertifikan hesabına eklenir ve LinkedIn’de paylaşılabilir.", tags: ["QR doğrulama", "LinkedIn", "PDF"] },
];

export const FOUNDERS = [
  { n: "01", name: "Tuğrul Günal", role: "Kurucu Ortak", color: BLUE, order: 0,
    photo: "/images/tugrul.jpeg",
    linkedin: "https://www.linkedin.com/in/tugrul-g%C3%BCnal/",
    short: "İşletme eğitimini Almanya’nın Mainz kentinde tamamladı; 36 yılı aşkın süre Siemens’te görev yaptı. TEDAR’ın Kurucu Yönetim Kurulu Başkanı ve Tuğrul Günal Danışmanlık’ın kurucusu.",
    bio: "İşletme alanındaki yüksek öğrenimini Almanya’nın Mainz kentinde tamamladı ve 36 yılı aşkın süre Siemens’te görev yaptı. Siemens’teki kariyeri boyunca Sağlık Sektörü Ticari Direktörlüğü, Türkiye İnsan Kaynakları Bölüm Direktörlüğü, Ücretlendirme ve Yan Haklar Bölüm Başkanlığı, Latin ve Kuzey Amerika İnsan Kaynakları Partnerliği (Münih), Strateji Bölümü Ticari Direktörlüğü (Viyana), IT Direktörlüğü ve Tedarik Zinciri Yönetimi Bölüm Direktörlüğü görevlerinde bulundu. PERYÖN Derneği’nde Yönetim Kurulu Başkanlığı yaptı. Halen TEDAR (Tedarik Zinciri Yönetimi Derneği) Kurucu Yönetim Kurulu Başkanı, SEDEFED Başkan Yardımcısı, PERYÖN Başkanlar Kurulu üyesi ve MEF Üniversitesi Dış Danışma Kurulu üyesi olarak görev yapıyor. Aynı zamanda Tuğrul Günal Danışmanlık Şirketi’nin kurucusudur." },
  { n: "02", name: "Kaan Tunçbilek", role: "Kurucu Ortak", color: PURP, order: 1,
    photo: "/images/kaan-tuncbilek.jpeg",
    linkedin: "https://www.linkedin.com/in/kaan-tuncbilek/",
    short: "İTÜ Endüstri Mühendisliği mezunu; Siemens’te 24, Garanti Bankası’nda 4 yıl çalıştı. Yapay Zekâ Adaptasyon ve Yol Haritası çalışmaları yapan Xellence Consultancy’nin kurucusu.",
    bio: "İTÜ Endüstri Mühendisliği mezunu olup INSEAD’da İleri Düzey Yönetim Programı’nı tamamladı. Siemens’te 24, Garanti Bankası’nda 4 yıl çalıştı. Siemens’teki kariyeri boyunca Hızlı Tren ve Metro projelerinde proje yöneticiliği, Enerji sektöründe satış grubunun finans yöneticiliği, tüm Siemens Türkiye’nin sözleşme yöneticiliği ve son 8 yıl Dijital Dönüşüm Projeleri yöneticiliği yaptı. Son pozisyonu global olup Avrupa’nın büyük bir kısmı kendisine bağlanmıştı; ayrıca global bir talent yetiştirme programı olan New Horizons’ın yöneticiliğini üstlendi. Halen TÜRKONFED Dijital Dönüşüm ve Yapay Zekâ kurullarının aktif üyesi. Aynı zamanda Xellence Consultancy şirketinin kurucusu olup Yapay Zekâ Adaptasyon ve Yol Haritası çalışmaları yapmaktadır." },
];

export const DEMO_CERT = {
  number: "PRF-2026-000000",
  holder: "Elif Yılmaz",
  course: "Veri Analitiğine Giriş",
  date: "12.09.2026",
};

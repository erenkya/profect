// TODO: Yayına çıkmadan önce gerçek şirket bilgileriyle doldurun ve metni bir hukukçuya onaylatın.
const CONTROLLER = {
  name: "[Şirket ünvanı]",
  address: "[Adres]",
  mersis: "[MERSİS no]",
  email: "[kvkk@alanadi.com]",
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Veri sorumlusu",
    body: (
      <p>
        6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca kişisel verileriniz, veri sorumlusu sıfatıyla{" "}
        <strong>{CONTROLLER.name}</strong> (Adres: {CONTROLLER.address}, MERSİS: {CONTROLLER.mersis}) tarafından aşağıda açıklanan kapsamda işlenmektedir.
      </p>
    ),
  },
  {
    title: "2. İşlenen kişisel veriler",
    body: (
      <ul>
        <li><strong>Kimlik ve iletişim:</strong> ad soyad, e-posta adresi, telefon numarası (isteğe bağlı).</li>
        <li><strong>Hesap güvenliği:</strong> şifreniz (yalnızca geri döndürülemez özet olarak saklanır), oturum bilgileri, giriş zamanı, IP adresi ve cihaz/tarayıcı bilgisi.</li>
        <li><strong>Eğitim verileri:</strong> kayıtlı olduğunuz kurslar, ders ilerlemeniz, sınav cevapları ve sonuçları, düzenlenen sertifikalar.</li>
        <li><strong>İşlem verileri:</strong> sipariş ve abonelik kayıtları.</li>
      </ul>
    ),
  },
  {
    title: "3. İşleme amaçları",
    body: (
      <ul>
        <li>Üyelik hesabınızı oluşturmak ve yönetmek,</li>
        <li>Kurs, sınav ve sertifika hizmetlerini sunmak; ilerlemenizi kaydetmek,</li>
        <li>Sipariş ve abonelik süreçlerini yürütmek,</li>
        <li>Hesap ve platform güvenliğini sağlamak, kötüye kullanımı ve otomatik saldırıları önlemek,</li>
        <li>Hukuki yükümlülükleri yerine getirmek ve destek taleplerinizi yanıtlamak.</li>
      </ul>
    ),
  },
  {
    title: "4. Hukuki sebepler",
    body: (
      <p>
        Verileriniz KVKK m.5/2 uyarınca; bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması, hukuki yükümlülüğün yerine getirilmesi, ilgili kişinin temel hak
        ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaati hukuki sebeplerine dayanılarak; bu aydınlatma metnini okuyup onaylamanız suretiyle işlenir.
      </p>
    ),
  },
  {
    title: "5. Aktarım",
    body: (
      <p>
        Kişisel verileriniz; hizmetin sunulması için gerekli olduğu ölçüde barındırma, e-posta gönderimi, güvenlik doğrulaması (bot koruması) ve ödeme hizmeti sağlayıcıları gibi
        hizmet sağlayıcılarımıza ve yasal olarak yetkili kamu kurum ve kuruluşlarına aktarılabilir. Verileriniz üçüncü kişilere pazarlama amacıyla satılmaz. Yurt dışına
        aktarım söz konusu olduğunda KVKK m.9 hükümlerine uyulur.
      </p>
    ),
  },
  {
    title: "6. Toplama yöntemi ve saklama süresi",
    body: (
      <p>
        Verileriniz kayıt formu, platform kullanımınız ve sistem kayıtları aracılığıyla elektronik ortamda toplanır. Üyeliğiniz devam ettiği sürece ve ilgili mevzuatta
        öngörülen zamanaşımı/saklama süreleri boyunca saklanır; süre sonunda silinir, yok edilir veya anonim hale getirilir. Doğrulanabilir sertifikalar, doğrulama amacıyla
        sertifika kodu üzerinden herkese açık olarak sorgulanabilir.
      </p>
    ),
  },
  {
    title: "7. Haklarınız",
    body: (
      <>
        <p>KVKK m.11 uyarınca veri sorumlusuna başvurarak şunları talep edebilirsiniz:</p>
        <ul>
          <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse buna ilişkin bilgi talep etme,</li>
          <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
          <li>Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,</li>
          <li>Eksik veya yanlış işlenmişse düzeltilmesini isteme,</li>
          <li>KVKK m.7 çerçevesinde silinmesini veya yok edilmesini isteme ve bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme,</li>
          <li>İşlenen verilerin otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme,</li>
          <li>Kanuna aykırı işlenmesi nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme.</li>
        </ul>
      </>
    ),
  },
  {
    title: "8. Başvuru",
    body: (
      <p>
        Taleplerinizi yazılı olarak veya <strong>{CONTROLLER.email}</strong> adresine kimliğinizi doğrulayan bilgilerle birlikte iletebilirsiniz. Başvurular en geç otuz gün
        içinde sonuçlandırılır.
      </p>
    ),
  },
];

/** Aydınlatma metninin bölümleri; hem /kvkk sayfasında hem kayıt formundaki açılır pencerede kullanılır. */
export function KvkkContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, lineHeight: 1.65 }}>
      {SECTIONS.map((s) => (
        <section key={s.title}>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>{s.title}</h2>
          {s.body}
        </section>
      ))}
    </div>
  );
}

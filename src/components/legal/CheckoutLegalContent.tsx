import { COMPANY } from "./company";
import "@/components/checkout/checkout.css";

// Taslak metinlerdir: yayından önce bir hukukçu tarafından incelenmeli ve şirket bilgileri (company.ts) doldurulmalıdır.
// İade süresi sitede verilen "14 gün içinde koşulsuz iade" taahhüdüyle tutarlıdır.

export function DistanceSalesContent() {
  return (
    <div className="legal-text">
      <h3>1. Taraflar</h3>
      <p>
        İşbu sözleşme, <strong>{COMPANY.name}</strong> (Adres: {COMPANY.address}, MERSİS: {COMPANY.mersis}; bundan sonra “Satıcı”) ile sipariş ekranında bilgileri yer alan ve sözleşmeyi
        elektronik ortamda onaylayan kişi (bundan sonra “Alıcı”) arasında akdedilmiştir.
      </p>
      <h3>2. Konu</h3>
      <p>
        Sözleşmenin konusu, Alıcı’nın Profect platformu üzerinden elektronik ortamda sipariş verdiği çevrimiçi eğitim içeriğinin (kurs) ve/veya Profect Plus aboneliğinin satışı ve ifasına ilişkin olarak
        6502 sayılı Tüketicinin Korunması Hakkında Kanun ile Mesafeli Sözleşmeler Yönetmeliği uyarınca tarafların hak ve yükümlülüklerinin belirlenmesidir.
      </p>
      <h3>3. Ürün ve bedel</h3>
      <p>
        Ürün/hizmetin adı, süresi, birim fiyatı ve toplam bedeli sipariş özetinde gösterilir; Alıcı sipariş onayından önce bunları görüntülediğini kabul eder. Fiyatlara KDV dahildir.
      </p>
      <h3>4. Ödeme</h3>
      <p>
        Ödeme, Satıcı’nın anlaşmalı ödeme kuruluşunun Sanal POS altyapısı üzerinden kredi/banka kartıyla 3D Secure doğrulamalı olarak tek çekim şeklinde alınır.
        Ödeme altyapısı henüz devreye alınmadıysa sipariş “onay bekliyor” durumunda kaydedilir ve ödeme onaylanana kadar erişim açılmaz.
      </p>
      <h3>5. İfa</h3>
      <p>
        Satın alınan içerik, ödemenin onaylanmasının ardından Alıcı’nın hesabında elektronik ortamda ve gecikmeksizin erişime açılır. Fiziksel teslimat yoktur.
      </p>
      <h3>6. Cayma ve iade</h3>
      <p>
        Alıcı, ödeme tarihinden itibaren 14 (on dört) gün içinde, gerekçe göstermeksizin sözleşmeden cayabilir ve bedelin iadesini talep edebilir. Ayrıntılar “Teslimat, İade ve İptal Koşulları”nda yer alır.
      </p>
      <h3>7. Uyuşmazlık</h3>
      <p>
        Uyuşmazlıklarda Ticaret Bakanlığı’nca ilan edilen parasal sınırlar dahilinde Alıcı’nın yerleşim yerindeki Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.
      </p>
      <p>İletişim: {COMPANY.email}</p>
    </div>
  );
}

export function CheckoutPrivacyContent() {
  return (
    <div className="legal-text">
      <h3>1. Kapsam</h3>
      <p>Bu metin, Alıcı’nın sipariş ve ödeme sürecinde paylaştığı bilgilerin işlenmesi ve korunmasına ilişkin esasları düzenler. Platformun genel kullanımına ilişkin veri işleme KVKK Aydınlatma Metni’nde ayrıca açıklanmıştır.</p>
      <h3>2. İşlenen veriler</h3>
      <p>Bireysel siparişte ad soyad ve e-posta; kurumsal siparişte ek olarak şirket unvanı, vergi dairesi ve numarası, adres ve telefon. Ayrıca sipariş bilgileri (ürün, tutar, tarih).</p>
      <h3>3. Kart bilgilerinin korunması</h3>
      <p>
        Kart numarası, son kullanma tarihi ve güvenlik kodu Satıcı’nın veritabanında <strong>saklanmaz</strong>. Bu bilgiler yalnızca ödeme işlemi sırasında şifreli bağlantıyla, PCI-DSS uyumlu ödeme kuruluşuna iletilir.
        Satıcı yalnızca maskelenmiş kart numarasını (ilk 6 ve son 4 hane) ve banka onay kodunu kayıt altında tutar.
      </p>
      <h3>4. Paylaşım</h3>
      <p>Sipariş ve fatura bilgileri; yasal yükümlülükler (e-arşiv fatura, saklama), ödemenin tahsili ve uyuşmazlık çözümü amacıyla ödeme kuruluşu, mali müşavirlik hizmeti sağlayıcıları ve yetkili kamu kurumlarıyla sınırlı olarak paylaşılabilir.</p>
      <h3>5. Saklama süresi</h3>
      <p>Sipariş ve fatura kayıtları, Vergi Usul Kanunu ve ilgili mevzuattaki yasal süreler boyunca saklanır.</p>
      <h3>6. Haklarınız</h3>
      <p>KVKK m.11 kapsamındaki haklarınızı {COMPANY.email} adresi üzerinden kullanabilirsiniz.</p>
    </div>
  );
}

export function DeliveryReturnContent() {
  return (
    <div className="legal-text">
      <h3>1. Teslimat</h3>
      <p>Ürün dijital bir eğitim içeriğidir; kargo ile teslimat yapılmaz. Ödemenin onaylanmasının ardından kurs/abonelik hesabınızda erişime açılır (olağan koşullarda en geç 24 saat içinde).</p>
      <h3>2. Bildirim</h3>
      <p>Erişimin açıldığı hesabınızdaki “Kurslarım” sayfasında ve sipariş sırasında verdiğiniz e-posta adresinde bildirilir.</p>
      <h3>3. Cayma ve iade</h3>
      <p>
        Ödeme tarihinden itibaren <strong>14 gün</strong> içinde {COMPANY.email} adresine başvurarak siparişinizi iptal edebilir ve ödediğiniz tutarın iadesini isteyebilirsiniz.
        Profect Plus aboneliğinde iade, iptal anına kadar kullanılmayan dönem için değerlendirilir.
      </p>
      <h3>4. İade yöntemi ve süre</h3>
      <p>Onaylanan iadeler, ödemenin yapıldığı karta, bankanın işlem süreleri saklı kalmak kaydıyla en geç 10 iş günü içinde yansıtılır.</p>
      <h3>5. Hizmet kesintisi</h3>
      <p>Satıcı’dan kaynaklanan uzun süreli kesintilerde, kesinti süresine karşılık gelen bedel talep üzerine değerlendirilir.</p>
      <h3>6. İletişim</h3>
      <p>{COMPANY.email}</p>
    </div>
  );
}

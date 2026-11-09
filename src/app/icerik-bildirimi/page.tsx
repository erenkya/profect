import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/components/legal/company";

// TODO: Yayına çıkmadan önce metni bir hukukçuya onaylatın.

export const metadata: Metadata = {
  title: "İçerik ve Telif Bildirimi",
  description: "Profect’te hukuka aykırı veya telif hakkınızı ihlal eden bir içerik gördüyseniz bunu nasıl bildireceğiniz.",
};

export default function ContentNoticePage() {
  return (
    <main className="wrap" style={{ paddingBlock: "clamp(56px,8vw,112px)", maxWidth: 820 }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>Yasal</div>
      <h1 style={{ fontSize: "clamp(36px,5vw,64px)", lineHeight: 1, textTransform: "uppercase", margin: "0 0 12px" }}>İçerik ve Telif Bildirimi</h1>
      <p style={{ color: "var(--muted-72)", margin: "0 0 40px" }}>
        5651 sayılı Kanun ve 5846 sayılı Fikir ve Sanat Eserleri Kanunu kapsamında içerik bildirim yöntemi.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, lineHeight: 1.65 }}>
        <section>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>1. Neyi bildirebilirsiniz?</h2>
          <p>
            Ders altındaki soru ve yorumlar gibi kullanıcıların oluşturduğu içeriklerde hukuka aykırı bir paylaşım (hakaret, kişilik haklarının ihlali, haksız rekabet vb.)
            veya telif hakkınızı ihlal eden bir eser görürseniz bize bildirebilirsiniz. Yorumların yanındaki “Bildir” bağlantısı, ilgili yorumun numarasını içeren hazır bir e-posta açar.
          </p>
        </section>
        <section>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>2. Bildirimde neler bulunmalı?</h2>
          <ul>
            <li>İçeriğin yeri: kurs, ders ve mümkünse yorum numarası ya da bağlantısı,</li>
            <li>Hangi hakkın ihlal edildiğinin kısa açıklaması; telif bildirimlerinde eser sahibi/hak sahibi olduğunuzu gösteren bilgi veya belge,</li>
            <li>Ad soyadınız ve size ulaşabileceğimiz e-posta adresiniz.</li>
          </ul>
        </section>
        <section>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>3. Bildirimi nereye iletmelisiniz?</h2>
          <p>
            <a href={`mailto:${COMPANY.email}?subject=${encodeURIComponent("İçerik bildirimi")}`}>{COMPANY.email}</a> adresine yazabilirsiniz.
          </p>
        </section>
        <section>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>4. Bildirimden sonra ne olur?</h2>
          <p>
            Bildirimi inceleriz; hukuka aykırı olduğunu tespit ettiğimiz içeriği yayından kaldırır, sonucu size e-postayla bildiririz. İçeriği paylaşan kullanıcının hesabı hakkında
            gerekli önlemleri de alabiliriz. Kişisel verilerinize ilişkin talepler için <Link href="/kvkk">KVKK Aydınlatma Metni</Link>’ndeki başvuru yolunu kullanabilirsiniz.
          </p>
        </section>
      </div>
      <p style={{ marginTop: 48 }}><Link href="/">← Ana sayfaya dön</Link></p>
    </main>
  );
}

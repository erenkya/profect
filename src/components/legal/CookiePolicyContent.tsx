import Link from "next/link";
import { CONSENT_MAX_AGE_DAYS } from "@/lib/consent";
import { CookieSettingsButton } from "@/components/legal/CookieSettingsButton";

// TODO: Yayına çıkmadan önce gerçek şirket bilgileriyle doldurun (KvkkContent.tsx'teki CONTROLLER ile aynı olmalı)
// ve metni bir hukukçuya onaylatın. Sitede yeni çerez/betik eklenirse aşağıdaki tabloyu güncelleyin.
const CONTROLLER = {
  name: "[Şirket ünvanı]",
  address: "[Adres]",
  email: "[kvkk@alanadi.com]",
};

type Row = { name: string; purpose: string; party: string; duration: string };

const NECESSARY: Row[] = [
  { name: "profect_auth_token", purpose: "Giriş yaptığınız oturumu doğrular (HttpOnly).", party: "Birinci taraf", duration: "7 gün" },
  { name: "profect_user_data", purpose: "Arayüzde adınızı ve rolünüzü göstermek için hassas olmayan oturum bilgisi.", party: "Birinci taraf", duration: "7 gün" },
  { name: "profect_consent", purpose: "Çerez tercihinizi hatırlar.", party: "Birinci taraf", duration: `${CONSENT_MAX_AGE_DAYS} gün` },
  { name: "profect_cart_v1 (tarayıcı depolaması)", purpose: "Sepetinizdeki ürünleri cihazınızda tutar; sunucuya gönderilmez.", party: "Birinci taraf", duration: "Siz silene kadar" },
  { name: "Cloudflare Turnstile", purpose: "Giriş ve kayıt formlarında otomatik bot saldırılarına karşı güvenlik doğrulaması.", party: "Üçüncü taraf (Cloudflare)", duration: "Cloudflare’in politikasına göre" },
];

function Table({ rows }: { rows: Row[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 560 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-divider)" }}>
            <th style={{ padding: "8px 12px 8px 0" }}>Ad</th>
            <th style={{ padding: "8px 12px" }}>Amaç</th>
            <th style={{ padding: "8px 12px" }}>Tür</th>
            <th style={{ padding: "8px 0 8px 12px" }}>Süre</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} style={{ borderBottom: "1px solid var(--color-divider)", verticalAlign: "top" }}>
              <td style={{ padding: "8px 12px 8px 0", fontFamily: "monospace", fontSize: 13 }}>{r.name}</td>
              <td style={{ padding: "8px 12px" }}>{r.purpose}</td>
              <td style={{ padding: "8px 12px" }}>{r.party}</td>
              <td style={{ padding: "8px 0 8px 12px" }}>{r.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Çerez nedir?",
    body: (
      <p>
        Çerezler, bir internet sitesini ziyaret ettiğinizde cihazınıza kaydedilen küçük metin dosyalarıdır. Bu politika; çerezlerin yanı sıra
        aynı amaçla kullanılan tarayıcı depolamasını (ör. localStorage) da kapsar.
      </p>
    ),
  },
  {
    title: "2. Veri sorumlusu ve hukuki dayanak",
    body: (
      <>
        <p>
          Veri sorumlusu <strong>{CONTROLLER.name}</strong>’dir (Adres: {CONTROLLER.address}; iletişim: {CONTROLLER.email}). Çerezler yoluyla
          işlenen kişisel veriler 6698 sayılı KVKK ve Kişisel Verileri Koruma Kurumu’nun Çerez Uygulamaları Hakkında Rehberi çerçevesinde işlenir.
        </p>
        <ul>
          <li><strong>Zorunlu çerezler:</strong> hizmetin sunulması için zorunlu olduğundan KVKK m.5/2 kapsamındaki işleme şartlarına (sözleşmenin ifası, veri sorumlusunun meşru menfaati) dayanır; açık rızanız aranmaz.</li>
          <li><strong>Analitik ve diğer zorunlu olmayan çerezler:</strong> yalnızca açık rızanıza dayanır ve siz izin vermedikçe çalıştırılmaz.</li>
        </ul>
      </>
    ),
  },
  {
    title: "3. Kullandığımız çerezler",
    body: (
      <>
        <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>Zorunlu</h3>
        <Table rows={NECESSARY} />
        <h3 style={{ fontSize: 16, margin: "20px 0 8px" }}>Analitik / performans ve reklam</h3>
        <p style={{ margin: 0 }}>
          Şu anda sitemizde analitik, performans veya reklam amaçlı çerez kullanılmamaktadır. İleride eklenmeleri hâlinde bu tablo güncellenir
          ve bu çerezler yalnızca onayınızla çalışır.
        </p>
      </>
    ),
  },
  {
    title: "4. Tercihlerinizi yönetme ve rızayı geri alma",
    body: (
      <>
        <p>
          Siteye ilk girişinizde “Kabul Et”, “Reddet” ve “Tercihler” seçeneklerini eşit görünürlükte sunarız. Reddetmeniz hâlinde sitenin tüm
          işlevlerini kullanmaya devam edebilirsiniz. Zorunlu olmayan çerezler varsayılan olarak kapalıdır.
        </p>
        <p>
          Tercihinizi istediğiniz an, rıza vermek kadar kolay biçimde değiştirebilir veya geri alabilirsiniz: <CookieSettingsButton>Çerez tercihlerini aç</CookieSettingsButton>.
          Tercihiniz {CONSENT_MAX_AGE_DAYS} gün boyunca hatırlanır; sonrasında yeniden sorulur.
        </p>
        <p>Çerezleri ayrıca tarayıcı ayarlarınızdan silebilir veya engelleyebilirsiniz; ancak zorunlu çerezlerin engellenmesi hâlinde giriş ve sepet gibi özellikler çalışmayabilir.</p>
      </>
    ),
  },
  {
    title: "5. Haklarınız",
    body: (
      <p>
        KVKK m.11 uyarınca verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini isteme gibi haklarınızı kullanmak için{" "}
        {CONTROLLER.email} adresine başvurabilirsiniz. Ayrıntılar için <Link href="/kvkk">KVKK Aydınlatma Metni</Link>’ne bakın.
      </p>
    ),
  },
];

export function CookiePolicyContent() {
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

import "server-only";
import nodemailer from "nodemailer";

function transporter() {
  const user = process.env.GOOGLE_MAIL_USER;
  const pass = process.env.GOOGLE_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) throw new Error("E-posta bilgileri tanımlı değil.");
  return {
    from: user,
    t: nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      // Takılan bir SMTP bağlantısı kayıt/giriş isteğini dakikalarca bekletmesin: hızlı hata ver, kullanıcı "Kodu tekrar gönder" der.
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 15_000,
    }),
  };
}

/** Gönderim: MAIL_DRY_RUN=true (yalnızca geliştirmede) iken e-posta yollanmaz, konsola yazılır — testler gerçek posta kutularını doldurmasın. */
async function deliver(msg: { to: string; cc?: string; subject: string; html: string; text: string }) {
  if (process.env.MAIL_DRY_RUN === "true" && process.env.NODE_ENV !== "production") {
    console.log(`[mail:dry-run] to=${msg.to}${msg.cc ? ` cc=${msg.cc}` : ""} subject=${msg.subject}\n${msg.text}`);
    return;
  }
  const { t, from } = transporter();
  await t.sendMail({ from: `"Profect" <${from}>`, ...msg });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, intro: string, buttonLabel: string, url: string, notice: string) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f6f6fb;font-family:Arial,sans-serif;color:#17142b">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #dbe4fd">
    <div style="background:#162357;color:#fff;padding:24px 28px">
      <div style="font-size:22px;font-weight:bold;letter-spacing:.04em">PROFECT</div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">${esc(title)}</div>
    </div>
    <div style="padding:28px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 24px">${esc(intro)}</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${esc(url)}" style="background:#3a5fdc;color:#fff;text-decoration:none;padding:12px 28px;font-weight:bold;display:inline-block">${esc(buttonLabel)}</a>
      </p>
      <p style="font-size:12px;color:#6b6880;word-break:break-all">Buton çalışmazsa bağlantıyı tarayıcınıza yapıştırın:<br>${esc(url)}</p>
      <p style="font-size:13px;color:#6b6880;line-height:1.5;margin-top:20px">${esc(notice)}</p>
    </div>
  </div>
</body></html>`;
}

function codeLayout(title: string, intro: string, code: string, notice: string) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f6f6fb;font-family:Arial,sans-serif;color:#17142b">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #dbe4fd">
    <div style="background:#162357;color:#fff;padding:24px 28px">
      <div style="font-size:22px;font-weight:bold;letter-spacing:.04em">PROFECT</div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">${esc(title)}</div>
    </div>
    <div style="padding:28px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 24px">${esc(intro)}</p>
      <p style="text-align:center;margin:28px 0">
        <span style="display:inline-block;background:#f1f4fe;border:1px solid #dbe4fd;color:#162357;font-family:'Courier New',monospace;font-size:34px;font-weight:bold;letter-spacing:.35em;padding:14px 12px 14px 24px">${esc(code)}</span>
      </p>
      <p style="font-size:13px;color:#6b6880;line-height:1.5;margin-top:20px">${esc(notice)}</p>
    </div>
  </div>
</body></html>`;
}

/** Kayıt sırasında e-posta sahipliğini doğrulayan 6 haneli kod. */
export async function sendVerificationCodeEmail(email: string, code: string, ttlMinutes: number) {
  const intro = "Profect’e hoş geldiniz! Hesabınızı etkinleştirmek için aşağıdaki doğrulama kodunu kayıt sayfasına girin.";
  const notice = `Bu kod ${ttlMinutes} dakika geçerlidir ve tek kullanımlıktır. Kodu kimseyle paylaşmayın. Bu hesabı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.`;
  await deliver({
    to: email,
    subject: `${code} — Profect doğrulama kodunuz`,
    html: codeLayout("E-posta Doğrulama", intro, code, notice),
    text: `${intro}\n\nDoğrulama kodunuz: ${code}\n\n${notice}`,
  });
}

/** Hesap sayfasından şifre değiştirilirken yeni şifreyi onaylatan bağlantı. */
export async function sendPasswordChangeConfirmationEmail(email: string, url: string, ttlMinutes: number) {
  const intro = "Hesabınızın şifresini değiştirmek istediniz. Değişikliği tamamlamak için aşağıdaki butonla onaylayın.";
  const notice = `Bu bağlantı ${ttlMinutes} dakika geçerlidir. Onaylamazsanız şifreniz değişmez. Bu talebi siz yapmadıysanız bu e-postayı yok sayın ve şifrenizi değiştirmeyi düşünün.`;
  await deliver({
    to: email,
    subject: "Şifre değişikliğini onaylayın — Profect",
    html: layout("Şifre Değişikliği Onayı", intro, "Değişikliği Onayla", url, notice),
    text: `${intro}\n\n${url}\n\n${notice}`,
  });
}

export type OrderReceipt = {
  orderNo: number;
  paidAt: string;
  buyer: { name: string; email: string; companyName?: string | null; taxOffice?: string | null; taxNumber?: string | null };
  items: { title: string; price: number }[];
  discount: number;
  couponCode?: string | null;
  total: number;
  maskedCard?: string | null;
  url: string;
};

const money = (n: number) => "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function receiptLayout(r: OrderReceipt) {
  const row = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:6px 0;font-size:14px;color:#6b6880">${esc(label)}</td><td style="padding:6px 0;font-size:14px;text-align:right;${bold ? "font-weight:bold;color:#162357;font-size:16px" : ""}">${esc(value)}</td></tr>`;
  const lines = r.items
    .map((i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eceefa;font-size:14px">${esc(i.title)}</td><td style="padding:10px 0;border-bottom:1px solid #eceefa;font-size:14px;text-align:right;white-space:nowrap">${esc(money(i.price))}</td></tr>`)
    .join("");
  const b = r.buyer;
  const buyer = [b.companyName ?? b.name, b.companyName ? `${b.taxOffice ?? ""} V.D. · ${b.taxNumber ?? ""}` : "", b.email].filter(Boolean).map(esc).join("<br>");
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Sipariş Özeti</title></head>
<body style="margin:0;background:#f6f6fb;font-family:Arial,sans-serif;color:#17142b">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #dbe4fd">
    <div style="background:#162357;color:#fff;padding:24px 28px">
      <div style="font-size:22px;font-weight:bold;letter-spacing:.04em">PROFECT</div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">Sipariş Özeti · #${r.orderNo}</div>
    </div>
    <div style="padding:28px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Ödemeniz alındı, teşekkür ederiz! Erişiminiz hesabınızda açıldı. Sipariş detaylarınız aşağıdadır.</p>
      <p style="font-size:13px;color:#6b6880;line-height:1.6;margin:0 0 20px"><strong style="color:#17142b">Alıcı</strong><br>${buyer}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:2px solid #162357">${lines}</table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px">
        ${r.discount > 0 ? row(r.couponCode ? `İndirim (${r.couponCode})` : "İndirim", `-${money(r.discount)}`) : ""}
        ${row("Toplam", money(r.total), true)}
        ${row("Ödeme tarihi", r.paidAt)}
        ${r.maskedCard ? row("Kart", r.maskedCard) : ""}
      </table>
      <p style="text-align:center;margin:28px 0">
        <a href="${esc(r.url)}" style="background:#3a5fdc;color:#fff;text-decoration:none;padding:12px 28px;font-weight:bold;display:inline-block">Kurslarıma Git</a>
      </p>
      <p style="font-size:12px;color:#6b6880;line-height:1.5">Bu e-posta sipariş ve ödeme bilgilendirmesidir. Sorularınız için bu e-postayı yanıtlayabilirsiniz.</p>
    </div>
  </div>
</body></html>`;
}

/** Ödeme alındığında alıcıya giden sipariş özeti / makbuz. */
export async function sendOrderReceiptEmail(r: OrderReceipt) {
  const text = [
    `Ödemeniz alındı, teşekkür ederiz! Sipariş #${r.orderNo}`,
    "",
    ...r.items.map((i) => `- ${i.title}: ${money(i.price)}`),
    ...(r.discount > 0 ? [`İndirim${r.couponCode ? ` (${r.couponCode})` : ""}: -${money(r.discount)}`] : []),
    `Toplam: ${money(r.total)}`,
    `Ödeme tarihi: ${r.paidAt}`,
    "",
    `Kurslarım: ${r.url}`,
  ].join("\n");
  await deliver({ to: r.buyer.email, subject: `Siparişiniz alındı #${r.orderNo} — Profect`, html: receiptLayout(r), text });
}

export async function sendPasswordResetEmail(email: string, url: string) {
  const intro = "Hesabınız için bir şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki butonu kullanın.";
  const notice = "Bu bağlantı 10 dakika geçerlidir. Talebi siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.";
  await deliver({
    to: email,
    subject: "Şifre sıfırlama — Profect",
    html: layout("Şifre Sıfırlama", intro, "Şifremi Sıfırla", url, notice),
    text: `${intro}\n\n${url}\n\n${notice}`,
  });
}

/** Ders altına yazılan her yorumun bildirimi ayrıca bu adrese CC gider. */
const QUESTION_CC = "kaan.tuncbilek@xellence.com.tr";

export type LessonQuestionMail = { studentName: string; courseTitle: string; lessonTitle: string; body: string; url: string };

/** Bir öğrenci ders altına soru yazınca dersin eğitmenine (ya da atanmamışsa yöneticilere) giden bildirim. */
export async function sendLessonQuestionEmail(to: string, q: LessonQuestionMail, withCc = true) {
  const intro = `${q.studentName}, “${q.courseTitle}” kursundaki “${q.lessonTitle}” dersinin altına bir soru yazdı: “${q.body}”`;
  const notice = "Cevaplamak için butonla soru ekranına gidin. Cevabınız dersin altında öğrencilere görünür.";
  await deliver({
    to,
    // Alıcı zaten bu adresse aynı postayı iki kez göndermeyelim.
    cc: withCc && to.toLowerCase() !== QUESTION_CC ? QUESTION_CC : undefined,
    subject: `Yeni soru: ${q.lessonTitle} — Profect`,
    html: layout("Derste Yeni Soru", intro, "Soruyu Cevapla", q.url, notice),
    text: `${intro}\n\n${q.url}\n\n${notice}`,
  });
}

/** Kurs hediyesi: alıcıya giden, alma linkini taşıyan e-posta. Ad ve not `layout()` içinde kaçışlanır. */
export async function sendGiftRecipientEmail(g: { to: string; senderName: string; courseTitle: string; message: string | null; url: string; expiresAt: string }) {
  const intro = `${g.senderName} sana “${g.courseTitle}” kursunu hediye etti.${g.message ? ` Notu: “${g.message}”` : ""} Hediyeni almak için aşağıdaki butonu kullan.`;
  const notice = `Bu hediye ${g.expiresAt} tarihine kadar geçerlidir ve yalnızca bu e-posta adresiyle alınabilir. Hesabın yoksa bu adresle kayıt olman istenir.`;
  await deliver({
    to: g.to,
    subject: `${g.senderName} sana bir kurs hediye etti — Profect`,
    html: layout("Kurs Hediyesi", intro, "Hediyemi Al", g.url, notice),
    text: `${intro}\n\n${g.url}\n\n${notice}`,
  });
}

/** Kurs hediyesi: gönderene giden onay; mail alıcıya ulaşmazsa linki başka yolla iletebilsin diye linki de içerir. */
export async function sendGiftSenderEmail(g: { to: string; recipientEmail: string; courseTitle: string; url: string; expiresAt: string }) {
  const intro = `“${g.courseTitle}” kursu için hediyeniz hazır. Alıcıya (${g.recipientEmail}) e-posta gönderdik.`;
  const notice = `Mail alıcıya ulaşmazsa bu linki ona başka bir yolla iletebilirsiniz. Link ${g.expiresAt} tarihine kadar geçerlidir ve yalnızca ${g.recipientEmail} adresiyle alınabilir.`;
  await deliver({
    to: g.to,
    subject: "Hediyeniz hazır — Profect",
    html: layout("Hediyeniz Hazır", intro, "Hediye linki", g.url, notice),
    text: `${intro}\n\n${g.url}\n\n${notice}`,
  });
}

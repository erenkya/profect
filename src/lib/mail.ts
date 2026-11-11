import "server-only";
import nodemailer from "nodemailer";
import { VAT_PERCENT } from "@/lib/vat";

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
  /** Toplama dahil KDV; 0 ise satır gösterilmez. */
  vat?: number;
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
        ${r.vat ? row(`KDV (%${VAT_PERCENT})`, money(r.vat)) : ""}
        ${row("Toplam (KDV dahil)", money(r.total), true)}
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
    ...(r.vat ? [`KDV (%${VAT_PERCENT}): ${money(r.vat)}`] : []),
    `Toplam (KDV dahil): ${money(r.total)}`,
    `Ödeme tarihi: ${r.paidAt}`,
    "",
    `Kurslarım: ${r.url}`,
  ].join("\n");
  await deliver({ to: r.buyer.email, subject: `Siparişiniz alındı #${r.orderNo} — Profect`, html: receiptLayout(r), text });
}

/** Yeni (ödemesi alınmamış) siparişlerin bildirimi bu adrese gider: müşteriyle iletişime geçilip ödeme alınır. */
export const ORDER_NOTIFY_TO = "kaan.tuncbilek@xellence.com.tr";

export type NewOrderNotice = {
  orderNo: number;
  createdAt: string;
  customer: { name: string; accountEmail: string; billingEmail: string; phone: string | null };
  invoice: { type: "bireysel" | "kurumsal"; companyName?: string | null; taxOffice?: string | null; taxNumber?: string | null; address?: string | null } | null;
  items: string[];
  giftTo?: string | null;
  couponCode?: string | null;
  discount: number;
  /** Müşterinin ödeyeceği tutar (KDV dahil). */
  total: number;
  adminUrl: string;
};

/** Yeni sipariş bildirimi (Kaan Bey'e): müşterinin iletişim bilgisi + sipariş içeriği. Tüm değerler kaçışlanır. */
export async function sendNewOrderNotificationEmail(n: NewOrderNotice, to = ORDER_NOTIFY_TO) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;font-size:14px;color:#6b6880;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:6px 0;font-size:14px">${value}</td></tr>`;
  const c = n.customer;
  const inv = n.invoice;
  const mailLink = (m: string) => `<a href="mailto:${esc(m)}" style="color:#3a5fdc">${esc(m)}</a>`;
  const phone = c.phone ? `<a href="tel:+90${esc(c.phone)}" style="color:#3a5fdc">0${esc(c.phone)}</a>` : "Girilmedi";
  const rows = [
    row("Ad soyad", esc(c.name)),
    row("Telefon", phone),
    row("Fatura e-postası", mailLink(c.billingEmail)),
    ...(c.accountEmail.toLowerCase() !== c.billingEmail.toLowerCase() ? [row("Hesap e-postası", mailLink(c.accountEmail))] : []),
    ...(inv?.type === "kurumsal" ? [row("Şirket", esc(`${inv.companyName ?? ""} · ${inv.taxOffice ?? ""} V.D. · VKN ${inv.taxNumber ?? ""}`)), row("Adres", esc(inv.address ?? ""))] : []),
  ].join("");
  const items = n.items.map((t) => `<li style="margin:2px 0">${esc(t)}</li>`).join("");
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Yeni Sipariş</title></head>
<body style="margin:0;background:#f6f6fb;font-family:Arial,sans-serif;color:#17142b">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #dbe4fd">
    <div style="background:#162357;color:#fff;padding:24px 28px">
      <div style="font-size:22px;font-weight:bold;letter-spacing:.04em">PROFECT</div>
      <div style="font-size:13px;opacity:.85;margin-top:4px">Yeni sipariş · #${n.orderNo}</div>
    </div>
    <div style="padding:28px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px">Yeni bir sipariş alındı. Müşteriyle iletişime geçip ödemeyi aldıktan sonra siparişi admin panelinden onaylayın; onayla birlikte eğitim hesabına tanımlanır.</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:20px">${rows}</table>
      <div style="border-top:2px solid #162357;padding-top:12px;font-size:14px">
        <strong>Sipariş içeriği</strong>
        <ul style="margin:8px 0 0;padding-left:20px">${items}</ul>
        ${n.giftTo ? `<p style="margin:10px 0 0;color:#6b6880">Hediye alıcısı: ${esc(n.giftTo)}</p>` : ""}
        ${n.discount > 0 ? `<p style="margin:10px 0 0;color:#1d8a55">Kupon${n.couponCode ? ` ${esc(n.couponCode)}` : ""}: -${esc(money(n.discount))}</p>` : ""}
        <p style="margin:10px 0 0;font-size:16px;font-weight:bold;color:#162357">Toplam (KDV dahil): ${esc(money(n.total))}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#6b6880">Sipariş zamanı: ${esc(n.createdAt)}</p>
      </div>
      <p style="text-align:center;margin:28px 0 0">
        <a href="${esc(n.adminUrl)}" style="background:#3a5fdc;color:#fff;text-decoration:none;padding:12px 28px;font-weight:bold;display:inline-block">Siparişlere Git</a>
      </p>
    </div>
  </div>
</body></html>`;
  const text = [
    `Yeni sipariş #${n.orderNo}`,
    "",
    `Ad soyad: ${c.name}`,
    `Telefon: ${c.phone ? `0${c.phone}` : "Girilmedi"}`,
    `Fatura e-postası: ${c.billingEmail}`,
    ...(c.accountEmail.toLowerCase() !== c.billingEmail.toLowerCase() ? [`Hesap e-postası: ${c.accountEmail}`] : []),
    ...(inv?.type === "kurumsal" ? [`Şirket: ${inv.companyName} · ${inv.taxOffice} V.D. · VKN ${inv.taxNumber}`, `Adres: ${inv.address}`] : []),
    "",
    ...n.items.map((t) => `- ${t}`),
    ...(n.giftTo ? [`Hediye alıcısı: ${n.giftTo}`] : []),
    ...(n.discount > 0 ? [`Kupon${n.couponCode ? ` ${n.couponCode}` : ""}: -${money(n.discount)}`] : []),
    `Toplam (KDV dahil): ${money(n.total)}`,
    `Sipariş zamanı: ${n.createdAt}`,
    "",
    `Siparişler: ${n.adminUrl}`,
  ].join("\n");
  await deliver({ to, subject: `Yeni sipariş #${n.orderNo} — ${c.name}`, html, text });
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
export const QUESTION_CC = "kaan.tuncbilek@xellence.com.tr";

export type LessonQuestionMail = { authorName: string; byStaff: boolean; courseTitle: string; lessonTitle: string; body: string; url: string };

/** Ders altına yorum yazılınca dersin eğitmenine (ya da atanmamışsa yöneticilere) giden bildirim; öğrenci "soru", personel "yorum" yazar. */
export async function sendLessonQuestionEmail(to: string, q: LessonQuestionMail, withCc = true) {
  const what = q.byStaff ? "yorum" : "soru";
  const intro = `${q.authorName}, “${q.courseTitle}” kursundaki “${q.lessonTitle}” dersinin altına bir ${what} yazdı: “${q.body}”`;
  const notice = "Cevaplamak için butonla soru ekranına gidin. Cevabınız dersin altında öğrencilere görünür.";
  await deliver({
    to,
    // Alıcı zaten bu adresse aynı postayı iki kez göndermeyelim.
    cc: withCc && to.toLowerCase() !== QUESTION_CC ? QUESTION_CC : undefined,
    subject: `Yeni ${what}: ${q.lessonTitle} — Profect`,
    html: layout(q.byStaff ? "Derste Yeni Yorum" : "Derste Yeni Soru", intro, q.byStaff ? "Yoruma Git" : "Soruyu Cevapla", q.url, notice),
    text: `${intro}\n\n${q.url}\n\n${notice}`,
  });
}

/** Hediye mailleri kursa ve programa göre değişen sözcükler (kurs: "kursunu", program: "programını"). */
const GIFT_WORDS = {
  course: { noun: "kurs", accusative: "kursunu", genitive: "kursu", heading: "Kurs Hediyesi" },
  program: { noun: "program", accusative: "programını", genitive: "programı", heading: "Program Hediyesi" },
} as const;

/** Kurs/program hediyesi: alıcıya giden, alma linkini taşıyan e-posta. Ad ve not `layout()` içinde kaçışlanır. */
export async function sendGiftRecipientEmail(g: { kind: "course" | "program"; to: string; senderName: string; itemTitle: string; message: string | null; url: string; expiresAt: string }) {
  const w = GIFT_WORDS[g.kind];
  const intro = `${g.senderName} sana “${g.itemTitle}” ${w.accusative} hediye etti.${g.message ? ` Notu: “${g.message}”` : ""} Hediyeni almak için aşağıdaki butonu kullan.`;
  const notice = `Bu hediye ${g.expiresAt} tarihine kadar geçerlidir ve yalnızca bu e-posta adresiyle alınabilir. Hesabın yoksa bu adresle kayıt olman istenir.`;
  await deliver({
    to: g.to,
    subject: `${g.senderName} sana bir ${w.noun} hediye etti — Profect`,
    html: layout(w.heading, intro, "Hediyemi Al", g.url, notice),
    text: `${intro}\n\n${g.url}\n\n${notice}`,
  });
}

/** Kurs/program hediyesi: gönderene giden onay; mail alıcıya ulaşmazsa linki başka yolla iletebilsin diye linki de içerir. */
export async function sendGiftSenderEmail(g: { kind: "course" | "program"; to: string; recipientEmail: string; itemTitle: string; url: string; expiresAt: string }) {
  const w = GIFT_WORDS[g.kind];
  const intro = `“${g.itemTitle}” ${w.genitive} için hediyeniz hazır. Alıcıya (${g.recipientEmail}) e-posta gönderdik.`;
  const notice = `Mail alıcıya ulaşmazsa bu linki ona başka bir yolla iletebilirsiniz. Link ${g.expiresAt} tarihine kadar geçerlidir ve yalnızca ${g.recipientEmail} adresiyle alınabilir.`;
  await deliver({
    to: g.to,
    subject: "Hediyeniz hazır — Profect",
    html: layout("Hediyeniz Hazır", intro, "Hediye linki", g.url, notice),
    text: `${intro}\n\n${g.url}\n\n${notice}`,
  });
}

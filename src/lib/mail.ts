import "server-only";
import nodemailer from "nodemailer";

function transporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) throw new Error("SMTP bilgileri tanımlı değil.");
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  return {
    from: user,
    t: nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user, pass },
    }),
  };
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

export async function sendVerificationEmail(email: string, url: string) {
  const { t, from } = transporter();
  await t.sendMail({
    from: `"Profect" <${from}>`,
    to: email,
    subject: "E-posta adresinizi doğrulayın — Profect",
    html: layout(
      "E-posta Doğrulama",
      "Profect’e hoş geldiniz! Hesabınızı etkinleştirmek için e-posta adresinizi doğrulayın.",
      "E-postamı Doğrula",
      url,
      "Bu bağlantı 24 saat geçerlidir. Bu hesabı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.",
    ),
  });
}

export async function sendPasswordResetEmail(email: string, url: string) {
  const { t, from } = transporter();
  await t.sendMail({
    from: `"Profect" <${from}>`,
    to: email,
    subject: "Şifre sıfırlama — Profect",
    html: layout(
      "Şifre Sıfırlama",
      "Hesabınız için bir şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki butonu kullanın.",
      "Şifremi Sıfırla",
      url,
      "Bu bağlantı 10 dakika geçerlidir. Talebi siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.",
    ),
  });
}

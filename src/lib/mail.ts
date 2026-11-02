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
    }),
  };
}

/** Gönderim: MAIL_DRY_RUN=true (yalnızca geliştirmede) iken e-posta yollanmaz, konsola yazılır — testler gerçek posta kutularını doldurmasın. */
async function deliver(msg: { to: string; subject: string; html: string; text: string }) {
  if (process.env.MAIL_DRY_RUN === "true" && process.env.NODE_ENV !== "production") {
    console.log(`[mail:dry-run] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
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

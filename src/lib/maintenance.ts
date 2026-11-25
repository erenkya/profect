// Bakım modu: MAINTENANCE_MODE=true iken site bakım sayfası döner (proxy.ts). Çalışma anında okunur;
// Vercel'de değer değişince yeni bir deploy gerekir.
export function isMaintenanceMode(): boolean {
  return /^(1|true|on|yes)$/i.test((process.env.MAINTENANCE_MODE ?? "").trim());
}

// Bakımdayken de açık kalanlar: yöneticinin giriş yapabilmesi için giriş sayfası ve oturum API'leri.
export function isMaintenanceExempt(pathname: string): boolean {
  return (
    pathname === "/giris" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/me"
  );
}

export const MAINTENANCE_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bakımdayız · Profect</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#fff;color:#14181f;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  main{max-width:560px}
  .tag{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;margin:0 0 20px}
  h1{font-size:clamp(34px,7vw,56px);line-height:1;margin:0 0 20px;text-transform:uppercase;letter-spacing:-.01em}
  p{font-size:18px;line-height:1.55;margin:0 0 12px;color:#4b5563}
  .mark{display:inline-block;width:14px;height:14px;border:2px solid #14181f;transform:rotate(45deg);margin-bottom:28px}
</style>
</head>
<body>
<main>
  <div class="mark" aria-hidden="true"></div>
  <p class="tag">Profect</p>
  <h1>Bakımdayız</h1>
  <p>Daha iyi bir deneyim için sitemizde planlı bir bakım çalışması yapıyoruz.</p>
  <p>Kısa süre içinde geri döneceğiz. Anlayışın için teşekkürler.</p>
</main>
</body>
</html>`;

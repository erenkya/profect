// Kayıt formunda girilen şifrenin doğrulama ekranına taşınması (yalnızca tarayıcı sekmesi boyunca, sessionStorage).
// Şifre sunucuda kayıtta saklanmaz; doğrulama adımında kodla birlikte gönderilir. Kayıp/erişilemezse doğrulama
// ekranı şifreyi yeniden sorar. Doğrulama başarılı olunca silinir.
const KEY = "profect_pending_password";

export function stashPendingPassword(email: string, password: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ email: email.trim().toLowerCase(), password }));
  } catch {
    /* sessionStorage kapalıysa doğrulama ekranı şifreyi sorar */
  }
}

export function readPendingPassword(email: string): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { email?: string; password?: string };
    return v.email === email.trim().toLowerCase() && typeof v.password === "string" && v.password ? v.password : null;
  } catch {
    return null;
  }
}

export function clearPendingPassword(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* yok say */
  }
}

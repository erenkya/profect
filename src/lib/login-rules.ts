// Girişin saf karar kuralı (DB/ağ içermez).
//
// Doğrulanmamış bir hesabın password_hash'i güvenilir DEĞİLDİR: kayıt sırasında şifre saklanmaz, hesap şifresi
// e-posta kodu girildiği anda yazılır (bkz. verifyEmailCode). Bu yüzden doğrulanmamış hesapta girilen şifre kanıt
// sayılmaz; kullanıcı yalnızca kod ekranına yönlendirilir.
export type LoginOutcome = "ok" | "invalid" | "inactive" | "needs_verification";

export function loginOutcome(a: { exists: boolean; active: boolean; verified: boolean; passwordMatches: boolean }): LoginOutcome {
  if (!a.exists) return "invalid";
  if (a.active && !a.verified) return "needs_verification";
  if (!a.passwordMatches) return "invalid";
  if (!a.active) return "inactive";
  return "ok";
}

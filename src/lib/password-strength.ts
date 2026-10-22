// Şifre kuralları ve güç puanı. Sunucu (zod şeması) ve istemci (güç göstergesi) aynı fonksiyonu kullanır.
// Kurallar OWASP/NIST SP 800-63B yönergelerine dayanır: yeterli uzunluk, yaygın/sızmış şifre engeli,
// kişisel bilgi engeli; puan tahmin edilebilirliğe (tekrar, ardışık dizi, sözlük) göre düşer.

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_BYTES = 72; // bcrypt yalnızca ilk 72 bayta bakar
export const PASSWORD_MIN_SCORE = 2;

export const STRENGTH_LABELS = ["Çok zayıf", "Zayıf", "Orta", "Güçlü", "Çok güçlü"] as const;

const COMMON = new Set([
  "password", "passw0rd", "parola", "sifre", "sifre123", "admin", "administrator", "welcome", "letmein", "login",
  "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm", "azerty", "qazwsx", "1q2w3e", "1q2w3e4r",
  "123456", "1234567", "12345678", "123456789", "1234567890", "111111", "000000", "123123", "654321", "696969",
  "iloveyou", "monkey", "dragon", "master", "sunshine", "princess", "football", "baseball", "superman", "batman",
  "abc123", "trustno1", "hello", "shadow", "michael", "jordan", "freedom", "whatever", "secret",
  "galatasaray", "fenerbahce", "besiktas", "trabzonspor", "istanbul", "ankara", "izmir", "turkiye", "turkey",
  "askim", "sevgilim", "canim", "annem", "babam", "kardesim", "profect", "xellence",
]);

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

const SEQUENCES = [
  "abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm", "qwertyuıopğüasdfghjklşizxcvbnmöç", "0123456789",
];

function foldTr(s: string) {
  return s.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
}

/** Yaygın şifre mi? Büyük/küçük harf, leet (p@ssw0rd) ve sondaki rakam/sembol ekleri göz ardı edilir. */
export function isCommonPassword(pw: string): boolean {
  const lower = foldTr(pw);
  const leet = [...lower].map((c) => LEET[c] ?? c).join("");
  for (const v of [lower, leet]) {
    const stripped = v.replace(/[^a-z]+$/g, "").replace(/^[^a-z]+/g, "");
    if (COMMON.has(v) || (stripped.length >= 4 && COMMON.has(stripped))) return true;
  }
  return false;
}

/** Şifre; kullanıcının adı/e-postası gibi kişisel verilerden (en az 4 karakterlik parça) biri içeriyor mu? */
export function containsPersonalInfo(pw: string, userInputs: readonly string[] = []): boolean {
  const p = foldTr(pw);
  return userInputs.some((input) =>
    foldTr(input)
      .split(/[^a-z0-9]+/)
      .some((part) => part.length >= 4 && p.includes(part)),
  );
}

/** Ardışık (abc, 321, qwe) dizilerde kaç karakter "bedava" tahmin edilir. */
function sequentialChars(pw: string): number {
  const p = foldTr(pw);
  let count = 0;
  for (let i = 0; i + 2 < p.length; i++) {
    const tri = p.slice(i, i + 3);
    const rev = [...tri].reverse().join("");
    if (SEQUENCES.some((s) => s.includes(tri) || s.includes(rev))) count++;
  }
  return count;
}

export type PasswordRule = { id: string; label: string; ok: boolean };

export type PasswordEvaluation = {
  rules: PasswordRule[];
  /** Tüm zorunlu kurallar sağlanıyor mu? */
  rulesOk: boolean;
  /** 0 (çok zayıf) – 4 (çok güçlü) */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** Tahmini entropi (bit) */
  bits: number;
  /** Kabul edilebilir mi? (kurallar + asgari puan) */
  acceptable: boolean;
};

export function evaluatePassword(pw: string, userInputs: readonly string[] = []): PasswordEvaluation {
  const bytes = new TextEncoder().encode(pw).length;
  const hasLower = /\p{Ll}/u.test(pw);
  const hasUpper = /\p{Lu}/u.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^\p{L}\d]/u.test(pw);
  const common = pw.length > 0 && isCommonPassword(pw);
  const personal = pw.length > 0 && containsPersonalInfo(pw, userInputs);

  const rules: PasswordRule[] = [
    { id: "length", label: `En az ${PASSWORD_MIN_LENGTH} karakter`, ok: [...pw].length >= PASSWORD_MIN_LENGTH && bytes <= PASSWORD_MAX_BYTES },
    { id: "lower", label: "Küçük harf (a-z)", ok: hasLower },
    { id: "upper", label: "Büyük harf (A-Z)", ok: hasUpper },
    { id: "digit", label: "Rakam (0-9)", ok: hasDigit },
    { id: "common", label: "Yaygın bir şifre olmamalı", ok: pw.length > 0 && !common },
    { id: "personal", label: "Ad veya e-postanı içermemeli", ok: pw.length > 0 && !personal },
  ];
  const rulesOk = rules.every((r) => r.ok);

  // Etkin uzunluk: tekrar eden karakterler yarım, ardışık dizi karakterleri sayılmaz.
  const chars = [...pw];
  const distinct = new Set(chars).size;
  const effective = Math.max(0, distinct + 0.5 * (chars.length - distinct) - sequentialChars(pw));
  const pool = (hasLower ? 26 : 0) + (hasUpper ? 26 : 0) + (hasDigit ? 10 : 0) + (hasSymbol ? 33 : 0);
  const bits = pool > 0 ? effective * Math.log2(pool) : 0;

  let score: 0 | 1 | 2 | 3 | 4 = bits < 30 ? 0 : bits < 45 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  if (common || personal) score = Math.min(score, 0) as 0;
  else if (!rules[0].ok) score = Math.min(score, 1) as 0 | 1;

  return {
    rules,
    rulesOk,
    score,
    label: pw ? STRENGTH_LABELS[score] : "",
    bits: Math.round(bits),
    acceptable: rulesOk && score >= PASSWORD_MIN_SCORE,
  };
}

/** İlk başarısız kuralın (veya yetersiz puanın) kullanıcıya gösterilecek mesajı; sorun yoksa null. */
export function passwordProblem(pw: string, userInputs: readonly string[] = []): string | null {
  if ([...pw].length < PASSWORD_MIN_LENGTH) return `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalıdır.`;
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX_BYTES) return "Şifre çok uzun (en fazla 72 bayt).";
  const ev = evaluatePassword(pw, userInputs);
  const failed = ev.rules.find((r) => !r.ok);
  if (failed) {
    const msg: Record<string, string> = {
      lower: "Şifre en az bir küçük harf içermelidir.",
      upper: "Şifre en az bir büyük harf içermelidir.",
      digit: "Şifre en az bir rakam içermelidir.",
      common: "Bu şifre çok yaygın; daha özgün bir şifre seçin.",
      personal: "Şifre adınızı veya e-posta adresinizi içermemelidir.",
    };
    return msg[failed.id] ?? "Şifre kurallara uymuyor.";
  }
  if (ev.score < PASSWORD_MIN_SCORE) return "Şifre tahmin edilmesi çok kolay (tekrar veya ardışık karakterler). Daha karmaşık bir şifre seçin.";
  return null;
}

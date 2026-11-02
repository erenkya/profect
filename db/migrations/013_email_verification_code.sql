-- E-posta doğrulama kodu (6 haneli, kayıt sırasında e-postayla gönderilir).
-- Önceki bağlantı tabanlı doğrulamanın kolonları yeniden kullanılır:
--   verification_token_hash   → kodun HMAC-SHA256 özeti (ham kod DB'ye yazılmaz)
--   verification_token_expiry → kodun son geçerlilik zamanı
-- Yeni kolonlar: yanlış deneme sayacı, yeniden gönderim sınırları ve doğrulama zamanı.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at        DATETIME         NULL AFTER email_verified,
  ADD COLUMN IF NOT EXISTS verification_attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER verification_token_expiry,
  ADD COLUMN IF NOT EXISTS verification_sent_at     DATETIME         NULL AFTER verification_attempts,
  ADD COLUMN IF NOT EXISTS verification_send_count  TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER verification_sent_at,
  ADD COLUMN IF NOT EXISTS verification_window_start DATETIME        NULL AFTER verification_send_count;

-- Bu göçten önce oluşturulmuş tüm hesaplar onaylı sayılır (kayıt e-posta doğrulaması olmadan açılıyordu).
UPDATE users
   SET email_verified = 1,
       email_verified_at = COALESCE(email_verified_at, created_at),
       verification_token_hash = NULL,
       verification_token_expiry = NULL
 WHERE email_verified = 0 OR email_verified_at IS NULL;

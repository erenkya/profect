-- Şifre değiştirmede e-posta onayı.
-- Hesap sayfasından şifre değiştirilince yeni şifre hemen uygulanmaz: bcrypt özeti burada bekler,
-- e-postadaki bağlantı onaylanınca password_hash'in yerine geçer.
--   pending_password_hash       → onay bekleyen yeni şifrenin bcrypt özeti
--   pending_password_token_hash → onay bağlantısındaki ham token'ın SHA-256 özeti
--   pending_password_expiry     → onay bağlantısının son geçerlilik zamanı
--   pending_password_sent_at    → onay e-postası gönderim zamanı (art arda istek sınırı için)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pending_password_hash       VARCHAR(255) NULL AFTER reset_token_expiry,
  ADD COLUMN IF NOT EXISTS pending_password_token_hash CHAR(64)     NULL AFTER pending_password_hash,
  ADD COLUMN IF NOT EXISTS pending_password_expiry     DATETIME     NULL AFTER pending_password_token_hash,
  ADD COLUMN IF NOT EXISTS pending_password_sent_at    DATETIME     NULL AFTER pending_password_expiry,
  ADD KEY IF NOT EXISTS idx_users_pending_password (pending_password_token_hash);

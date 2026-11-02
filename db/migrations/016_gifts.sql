-- Kurs hediye etme.
--   enrollments.source → 'gift': hediyeyle kazanılan erişim
--   gifts              → bir ödeme siparişine bağlı, mail adresine gönderilen tek kurs hediyesi
--     status: awaiting_payment (ödeme bekliyor) → pending (token üretildi, alıcı bekleniyor) → claimed (alındı)
--             yan dallar: expired (süresi doldu) · cancelled (ödeme reddedildi)
--     token_hash: alma linkindeki ham token'ın SHA-256 özeti (düz token saklanmaz); alınca NULL'lanır
--     recipient_email: küçük harfe çevrilmiş; hediye yalnızca bu adresle doğrulanmış hesapla alınır
--     sent_at / send_count / send_window_start: mail yeniden gönderme ve link yenileme sınırı
ALTER TABLE enrollments
  MODIFY COLUMN source ENUM('admin','purchase','plus','gift') NOT NULL DEFAULT 'admin';

CREATE TABLE IF NOT EXISTS gifts (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id           INT UNSIGNED NOT NULL,
  sender_id          INT UNSIGNED NOT NULL,
  course_id          INT UNSIGNED NOT NULL,
  recipient_email    VARCHAR(190) NOT NULL,
  message            VARCHAR(300) NULL,
  status             ENUM('awaiting_payment','pending','claimed','expired','cancelled') NOT NULL DEFAULT 'awaiting_payment',
  token_hash         CHAR(64)     NULL,
  expires_at         DATETIME     NULL,
  claimed_by_user_id INT UNSIGNED NULL,
  claimed_at         DATETIME     NULL,
  sent_at            DATETIME     NULL,
  send_count         INT UNSIGNED NOT NULL DEFAULT 0,
  send_window_start  DATETIME     NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gifts_order (order_id),
  UNIQUE KEY uq_gifts_token (token_hash),
  KEY idx_gifts_sender (sender_id, created_at),
  KEY idx_gifts_recipient (recipient_email),
  CONSTRAINT fk_gifts_order   FOREIGN KEY (order_id)           REFERENCES orders (id)  ON DELETE CASCADE,
  CONSTRAINT fk_gifts_sender  FOREIGN KEY (sender_id)          REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_gifts_course  FOREIGN KEY (course_id)          REFERENCES courses (id) ON DELETE RESTRICT,
  CONSTRAINT fk_gifts_claimer FOREIGN KEY (claimed_by_user_id) REFERENCES users (id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- İade süreci: kullanıcı sipariş sayfasından talep eder, admin kuyrukta onaylar/reddeder.
--   orders.status       → 'refunded': iade tamamlandı (para iade edildi, erişim geri alındı)
--   orders.refunded_at  → iadenin sonuçlandığı an
--   refund_requests     → sipariş başına TEK başvuru (UNIQUE order_id); tam sipariş iadesi, kısmi iade yok
--     status: requested (admin kararı bekliyor) → approved (onaylandı; elle ödemede banka iadesi bekleniyor)
--             → refunded (iade edildi) | yan dallar: rejected (reddedildi) · failed (sağlayıcı hatası, yeniden denenir)
--     amount: başvuru anındaki orders.amount (indirim sonrası tahsil edilen tutar)
--     eligibility_json: başvuru anındaki uygunluk özeti · override: admin uygunluk dışı onay verdi mi
--     provider_ref: sağlayıcının iade referansı (idempotency: dolu ise sağlayıcı çağrısı tekrarlanmaz)
-- Yalnızca ENUM'a değer ve yeni sütun/tablo ekler; mevcut satırlar değişmez. Kart verisi saklanmaz.
ALTER TABLE orders
  MODIFY COLUMN status ENUM('pending','paid','rejected','refunded') NOT NULL DEFAULT 'pending';

SET @has_refunded_at := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'refunded_at');
SET @sql := IF(@has_refunded_at = 0, 'ALTER TABLE orders ADD COLUMN refunded_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS refund_requests (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id         INT UNSIGNED NOT NULL,
  user_id          INT UNSIGNED NOT NULL,
  amount           DECIMAL(10,2) NOT NULL,
  currency         CHAR(3)       NOT NULL DEFAULT 'TRY',
  status           ENUM('requested','approved','refunded','rejected','failed') NOT NULL DEFAULT 'requested',
  reason           VARCHAR(500)  NULL,
  eligibility_json JSON          NULL,
  override         TINYINT(1)    NOT NULL DEFAULT 0,
  decision_note    VARCHAR(500)  NULL,
  decided_by       INT UNSIGNED  NULL,
  decided_at       DATETIME      NULL,
  provider         VARCHAR(30)   NULL,
  provider_ref     VARCHAR(120)  NULL,
  error_message    VARCHAR(255)  NULL,
  refunded_at      DATETIME      NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refund_requests_order (order_id),
  KEY idx_refund_requests_status (status, created_at),
  KEY idx_refund_requests_user (user_id),
  CONSTRAINT fk_refund_requests_order   FOREIGN KEY (order_id)   REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_refund_requests_user    FOREIGN KEY (user_id)    REFERENCES users (id)  ON DELETE CASCADE,
  CONSTRAINT fk_refund_requests_decider FOREIGN KEY (decided_by) REFERENCES users (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

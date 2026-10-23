-- Kupon kodları: yönetici oluşturur, kullanıcı ödeme sırasında girer. İndirim sepet toplamına uygulanır (TRY).
-- Kullanım sayısı yalnızca ÖDENMİŞ siparişlerden (coupon_redemptions) sayılır; terk edilen/reddedilen sipariş hak tüketmez.
CREATE TABLE IF NOT EXISTS coupons (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code              VARCHAR(40)  NOT NULL,
  discount_type     ENUM('percentage','fixed') NOT NULL,
  discount_value    DECIMAL(10,2) NOT NULL,              -- percentage: 1-100 · fixed: TL
  valid_from        DATETIME NULL,
  valid_until       DATETIME NULL,
  max_uses          INT UNSIGNED NULL,                   -- NULL = sınırsız
  max_uses_per_user INT UNSIGNED NULL,                   -- NULL = sınırsız
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  coupon_id       INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  order_id        INT UNSIGNED NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_redemption_order (order_id),            -- aynı sipariş iki kez sayılmaz
  KEY idx_redemptions_coupon (coupon_id),
  KEY idx_redemptions_user (coupon_id, user_id),
  CONSTRAINT fk_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE,
  CONSTRAINT fk_redemptions_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_redemptions_order  FOREIGN KEY (order_id)  REFERENCES orders (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- orders.amount = tahsil edilen (indirimli) tutar; kalemlerin liste fiyatı order_items.unit_price'ta kalır.
ALTER TABLE orders
  ADD COLUMN coupon_id INT UNSIGNED NULL AFTER error_message,
  ADD COLUMN coupon_code VARCHAR(40) NULL AFTER coupon_id,
  ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER coupon_code,
  ADD CONSTRAINT fk_orders_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE SET NULL;

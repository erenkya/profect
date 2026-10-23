-- Sepet + checkout: bir sipariş artık birden çok kalem taşır (order_items). Fatura bilgileri, yasal onay
-- zamanı ve ödeme sağlayıcısı sonucu siparişe yazılır. Kart verisi ASLA saklanmaz (yalnızca maskeli numara).
-- Geriye dönük uyumlu: eski tek kalemli siparişler (plan = single | plus) olduğu gibi çalışır.
ALTER TABLE orders
  MODIFY plan ENUM('single','plus','cart') NOT NULL,
  ADD COLUMN invoice_type ENUM('bireysel','kurumsal') NULL AFTER provider_ref,
  ADD COLUMN full_name VARCHAR(160) NULL AFTER invoice_type,
  ADD COLUMN email VARCHAR(190) NULL AFTER full_name,
  ADD COLUMN phone VARCHAR(40) NULL AFTER email,
  ADD COLUMN tckn CHAR(11) NULL AFTER phone,
  ADD COLUMN company_name VARCHAR(200) NULL AFTER tckn,
  ADD COLUMN tax_office VARCHAR(120) NULL AFTER company_name,
  ADD COLUMN tax_number VARCHAR(11) NULL AFTER tax_office,
  ADD COLUMN address VARCHAR(500) NULL AFTER tax_number,
  ADD COLUMN city VARCHAR(80) NULL AFTER address,
  ADD COLUMN district VARCHAR(80) NULL AFTER city,
  ADD COLUMN zip_code VARCHAR(10) NULL AFTER district,
  ADD COLUMN consents_accepted_at DATETIME NULL AFTER zip_code,
  ADD COLUMN consent_ip VARCHAR(64) NULL AFTER consents_accepted_at,
  ADD COLUMN bank_auth_code VARCHAR(32) NULL AFTER consent_ip,
  ADD COLUMN masked_card VARCHAR(32) NULL AFTER bank_auth_code,
  ADD COLUMN error_message VARCHAR(255) NULL AFTER masked_card,
  ADD KEY idx_orders_provider_ref (provider_ref);

CREATE TABLE IF NOT EXISTS order_items (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   INT UNSIGNED NOT NULL,
  item_type  ENUM('course','plus') NOT NULL,
  course_id  INT UNSIGNED NULL,                  -- item_type=course ise dolu
  title      VARCHAR(200) NOT NULL,              -- sipariş anındaki ad (kurs sonradan silinse de kayıt kalır)
  unit_price DECIMAL(10,2) NOT NULL,             -- sipariş anındaki fiyat
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order  FOREIGN KEY (order_id)  REFERENCES orders (id)  ON DELETE CASCADE,
  CONSTRAINT fk_order_items_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

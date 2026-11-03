-- Şirket (kurumsal) hesapları ve kontenjan sistemi.
--   companies               → şirket; `code` benzersiz katılım kodu (ACME-7K4Q)
--   company_domains         → şirkete ait mail uzantıları (acme.com); bir uzantı tek şirkete aittir
--   company_members         → şirket üyeliği. Bir kullanıcı tek şirkete bağlıdır (user_id UNIQUE).
--     status: pending (katılım onayı bekliyor) · active. Red / çıkarma satırı siler.
--     role: member · admin (bir şirkette birden çok admin olabilir)
--   company_allocations     → şirketin kurs başına kontenjan girişleri. Toplam = SUM(quantity).
--     source purchase: sipariş ödenince (order_id dolu) · admin: ana adminin tanımı (quantity negatif olabilir)
--   company_assignments     → kontenjanın bir üyeye atanması.
--     active: atanmış · revoked: geri alındı, kontenjan havuza döndü · burned: izlenmiş eğitimden geri alındı, kontenjan yandı
--     Boş kontenjan = toplam − COUNT(active) − COUNT(burned)
--   company_course_requests → üyenin şirket adminine "bu kursu alın" talebi; aynı üye+kurs için tek açık (pending) talep
--   company_signup_intents  → kayıtta seçilen niyet (şirket oluştur / koda katıl); e-posta doğrulanınca uygulanır
--   enrollments.source      → 'company': şirket kontenjanıyla açılan kayıt
--   orders.company_id       → kontenjan siparişini veren şirket
--   order_items             → item_type='seats' + quantity (kişi sayısı); unit_price satır toplamıdır (fiyat × adet)
CREATE TABLE IF NOT EXISTS companies (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(200) NOT NULL,
  code       VARCHAR(20)  NOT NULL,
  tax_office VARCHAR(120) NULL,
  tax_number VARCHAR(11)  NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_domains (
  company_id INT UNSIGNED NOT NULL,
  domain     VARCHAR(190) NOT NULL,
  PRIMARY KEY (company_id, domain),
  UNIQUE KEY uq_company_domain (domain),
  CONSTRAINT fk_company_domains_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_members (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id   INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  role         ENUM('member','admin') NOT NULL DEFAULT 'member',
  status       ENUM('pending','active') NOT NULL DEFAULT 'pending',
  requested_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at  DATETIME     NULL,
  approved_by  INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_member_user (user_id),
  KEY idx_company_members_company (company_id, status),
  CONSTRAINT fk_company_members_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_members_user    FOREIGN KEY (user_id)    REFERENCES users (id)     ON DELETE CASCADE,
  CONSTRAINT fk_company_members_by      FOREIGN KEY (approved_by) REFERENCES users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_allocations (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT UNSIGNED NOT NULL,
  course_id  INT UNSIGNED NOT NULL,
  quantity   INT          NOT NULL,
  source     ENUM('purchase','admin') NOT NULL,
  order_id   INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_alloc_order (order_id),
  KEY idx_company_alloc_company_course (company_id, course_id),
  CONSTRAINT fk_company_alloc_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_alloc_course  FOREIGN KEY (course_id)  REFERENCES courses (id)   ON DELETE RESTRICT,
  CONSTRAINT fk_company_alloc_order   FOREIGN KEY (order_id)   REFERENCES orders (id)    ON DELETE SET NULL,
  CONSTRAINT fk_company_alloc_by      FOREIGN KEY (created_by) REFERENCES users (id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_assignments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id  INT UNSIGNED NOT NULL,
  course_id   INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  status      ENUM('active','revoked','burned') NOT NULL DEFAULT 'active',
  assigned_by INT UNSIGNED NULL,
  assigned_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_assignment (company_id, course_id, user_id),
  KEY idx_company_assign_course (company_id, course_id, status),
  KEY idx_company_assign_user (user_id),
  CONSTRAINT fk_company_assign_company FOREIGN KEY (company_id)  REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_assign_course  FOREIGN KEY (course_id)   REFERENCES courses (id)   ON DELETE RESTRICT,
  CONSTRAINT fk_company_assign_user    FOREIGN KEY (user_id)     REFERENCES users (id)     ON DELETE CASCADE,
  CONSTRAINT fk_company_assign_by      FOREIGN KEY (assigned_by) REFERENCES users (id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_course_requests (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id  INT UNSIGNED NOT NULL,
  course_id   INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  status      ENUM('pending','fulfilled','rejected') NOT NULL DEFAULT 'pending',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME     NULL,
  resolved_by INT UNSIGNED NULL,
  open_key    TINYINT GENERATED ALWAYS AS (IF(status = 'pending', 1, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_request_open (user_id, course_id, open_key),
  KEY idx_company_requests_company (company_id, status),
  CONSTRAINT fk_company_req_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_req_course  FOREIGN KEY (course_id)  REFERENCES courses (id)   ON DELETE CASCADE,
  CONSTRAINT fk_company_req_user    FOREIGN KEY (user_id)    REFERENCES users (id)     ON DELETE CASCADE,
  CONSTRAINT fk_company_req_by      FOREIGN KEY (resolved_by) REFERENCES users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_signup_intents (
  user_id    INT UNSIGNED NOT NULL,
  kind       ENUM('create','join') NOT NULL,
  payload    TEXT         NOT NULL,                           -- JSON
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_company_intent_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kaynak/kalem genişletmeleri yalnızca ENUM'a ekler ve yeni sütun açar; mevcut satırlar değişmez.
ALTER TABLE enrollments
  MODIFY COLUMN source ENUM('admin','purchase','plus','gift','company') NOT NULL DEFAULT 'admin';

ALTER TABLE orders
  ADD COLUMN company_id INT UNSIGNED NULL,
  ADD KEY idx_orders_company (company_id),
  ADD CONSTRAINT fk_orders_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL;

ALTER TABLE order_items
  MODIFY COLUMN item_type ENUM('course','plus','program','seats') NOT NULL,
  ADD COLUMN quantity INT UNSIGNED NOT NULL DEFAULT 1;

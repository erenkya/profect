-- Şirket program kontenjanı: Uzmanlık Programı için kurs kontenjanının paralel havuzu (kurs tabloları değişmez).
--   company_program_allocations → şirketin program başına kontenjan girişleri. Toplam = SUM(quantity).
--     source purchase: sipariş ödenince (order_id dolu) · admin: ana adminin tanımı (quantity negatif olabilir)
--   company_program_assignments → program kontenjanının bir üyeye atanması (kurs atamasıyla aynı durumlar).
--     active: atanmış · revoked: geri alındı, kontenjan havuza döndü · burned: başlanmış programdan geri alındı, kontenjan yandı
--     Boş kontenjan = toplam − COUNT(active) − COUNT(burned)
--   program_enrollments.source  → 'company': şirket program kontenjanıyla açılan üyelik
--   order_items.item_type       → 'program_seats' (+ program_id, quantity): şirketin program kontenjanı siparişi
-- Yalnızca yeni tablo ekler ve ENUM'lara değer ekler; mevcut satırlar değişmez, dosya yeniden çalıştırılabilir.
CREATE TABLE IF NOT EXISTS company_program_allocations (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT UNSIGNED NOT NULL,
  program_id INT UNSIGNED NOT NULL,
  quantity   INT          NOT NULL,
  source     ENUM('purchase','admin') NOT NULL,
  order_id   INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_program_alloc_order (order_id),
  KEY idx_company_program_alloc_company_program (company_id, program_id),
  CONSTRAINT fk_company_program_alloc_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_program_alloc_program FOREIGN KEY (program_id) REFERENCES programs (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_company_program_alloc_order   FOREIGN KEY (order_id)   REFERENCES orders (id)    ON DELETE SET NULL,
  CONSTRAINT fk_company_program_alloc_by      FOREIGN KEY (created_by) REFERENCES users (id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_program_assignments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id  INT UNSIGNED NOT NULL,
  program_id  INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  status      ENUM('active','revoked','burned') NOT NULL DEFAULT 'active',
  assigned_by INT UNSIGNED NULL,
  assigned_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_program_assignment (company_id, program_id, user_id),
  KEY idx_company_program_assign_program (company_id, program_id, status),
  KEY idx_company_program_assign_user (user_id),
  CONSTRAINT fk_company_program_assign_company FOREIGN KEY (company_id)  REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_program_assign_program FOREIGN KEY (program_id)  REFERENCES programs (id)  ON DELETE RESTRICT,
  CONSTRAINT fk_company_program_assign_user    FOREIGN KEY (user_id)     REFERENCES users (id)     ON DELETE CASCADE,
  CONSTRAINT fk_company_program_assign_by      FOREIGN KEY (assigned_by) REFERENCES users (id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE program_enrollments
  MODIFY COLUMN source ENUM('purchase','gift','auto','admin','company') NOT NULL;

ALTER TABLE order_items
  MODIFY COLUMN item_type ENUM('course','plus','program','seats','program_seats') NOT NULL;

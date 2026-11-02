-- Uzmanlık Programı (kurs paketi).
--   programs              → birden çok kursu tek fiyatla paketleyen üst yapı (B = programın kendi sabit fiyatı)
--   program_courses       → programın kursları + önerilen sıra (roadmap); bir kurs birden çok programda olabilir
--   program_enrollments   → "kullanıcı programa dahil mi?" sorusunun tek cevabı
--     source: purchase (satın alma) · gift (hediye) · auto (tüm kurs sertifikaları alındığı için otomatik)
--   program_certificates  → program sertifikası (kod PRP-YYYY-NNNNNN); kullanıcı+program başına en fazla bir
--   order_items           → item_type='program' + program_id
--   gifts                 → course_id artık NULL olabilir; tam biri course_id / program_id dolu (CHECK)
CREATE TABLE IF NOT EXISTS programs (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(120)  NOT NULL,
  code          VARCHAR(30)   NOT NULL,                       -- PRG-101
  title         VARCHAR(255)  NOT NULL,
  description   TEXT          NOT NULL,
  category      VARCHAR(80)   NOT NULL DEFAULT '',
  thumbnail_url VARCHAR(255)  NULL,
  price         DECIMAL(10,2) NOT NULL DEFAULT 0,             -- programın kendi fiyatı (B)
  is_published  TINYINT(1)    NOT NULL DEFAULT 0,
  sort_order    INT           NOT NULL DEFAULT 0,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_programs_slug (slug),
  UNIQUE KEY uq_programs_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS program_courses (
  program_id INT UNSIGNED NOT NULL,
  course_id  INT UNSIGNED NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (program_id, course_id),
  KEY idx_program_courses_course (course_id),
  CONSTRAINT fk_program_courses_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE CASCADE,
  CONSTRAINT fk_program_courses_course  FOREIGN KEY (course_id)  REFERENCES courses (id)  ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS program_enrollments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  program_id  INT UNSIGNED NOT NULL,
  source      ENUM('purchase','gift','auto') NOT NULL,
  enrolled_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_program_enrollment (user_id, program_id),
  KEY idx_program_enrollments_program (program_id),
  CONSTRAINT fk_program_enroll_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
  CONSTRAINT fk_program_enroll_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS program_certificates (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  program_id       INT UNSIGNED NOT NULL,
  certificate_code VARCHAR(30)  NOT NULL,                     -- PRP-YYYY-NNNNNN
  issued_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_program_cert_user_program (user_id, program_id),
  UNIQUE KEY uq_program_cert_code (certificate_code),
  KEY idx_program_certs_program (program_id),
  CONSTRAINT fk_program_cert_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
  CONSTRAINT fk_program_cert_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sipariş kalemi: program. Genişletme yalnızca ENUM'a ekler; mevcut satırlar değişmez.
ALTER TABLE order_items
  MODIFY COLUMN item_type ENUM('course','plus','program') NOT NULL,
  ADD COLUMN program_id INT UNSIGNED NULL AFTER course_id,
  ADD KEY idx_order_items_program (program_id),
  ADD CONSTRAINT fk_order_items_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE SET NULL;

-- Hediye: kurs YA DA program. Mevcut satırların hepsinde course_id dolu, program_id NULL → CHECK'i sağlar.
ALTER TABLE gifts
  MODIFY COLUMN course_id INT UNSIGNED NULL,
  ADD COLUMN program_id INT UNSIGNED NULL AFTER course_id,
  ADD KEY idx_gifts_program (program_id),
  ADD CONSTRAINT fk_gifts_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE RESTRICT,
  ADD CONSTRAINT chk_gifts_target CHECK ((course_id IS NULL) <> (program_id IS NULL));

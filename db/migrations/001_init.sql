-- Profect LMS — ilk şema
-- x-plore (XellenceWeb) altyapısından uyarlandı: kullanıcılar, içerik hiyerarşisi
-- (kurs > modül > ders/sınav), kayıt, ilerleme, sınav denemeleri, sertifika.
-- Profect'e özgü eklemeler: sipariş (satın alma) ve Profect Plus aboneliği.
-- Tüm tablolar InnoDB + utf8mb4. Yeniden çalıştırmak güvenlidir (IF NOT EXISTS).

-- ── Kullanıcılar ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name                 VARCHAR(150) NOT NULL,
  email                     VARCHAR(190) NOT NULL,
  phone                     VARCHAR(40)  NULL,
  password_hash             VARCHAR(255) NOT NULL,            -- bcrypt (cost 10)
  role                      ENUM('user','admin') NOT NULL DEFAULT 'user',
  is_active                 TINYINT(1)   NOT NULL DEFAULT 1,
  email_verified            TINYINT(1)   NOT NULL DEFAULT 0,
  verification_token_hash   CHAR(64)     NULL,                -- SHA-256; ham token yalnızca e-postada
  verification_token_expiry DATETIME     NULL,
  reset_token_hash          CHAR(64)     NULL,
  reset_token_expiry        DATETIME     NULL,
  kvkk_consent_at           DATETIME     NULL,
  plus_until                DATETIME     NULL,                -- Profect Plus erişim bitişi
  last_login_at             DATETIME     NULL,
  created_at                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_verification (verification_token_hash),
  KEY idx_users_reset (reset_token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── İçerik ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug          VARCHAR(120) NOT NULL,
  code          VARCHAR(30)  NOT NULL,                        -- PRF-101
  title         VARCHAR(255) NOT NULL,
  description   TEXT         NOT NULL,
  category      VARCHAR(80)  NOT NULL DEFAULT '',
  level         VARCHAR(30)  NOT NULL DEFAULT 'Başlangıç',
  instructor    VARCHAR(150) NOT NULL DEFAULT '',
  hours         INT UNSIGNED NOT NULL DEFAULT 0,
  rating        DECIMAL(2,1) NULL,
  price         DECIMAL(10,2) NOT NULL DEFAULT 0,
  old_price     DECIMAL(10,2) NULL,
  outcomes      TEXT         NULL,                            -- JSON dizi: ["...", "..."]
  thumbnail_url VARCHAR(255) NULL,
  is_published  TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order    INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_slug (slug),
  UNIQUE KEY uq_courses_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS modules (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id  INT UNSIGNED NOT NULL,
  title      VARCHAR(255) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_modules_course (course_id, sort_order),
  CONSTRAINT fk_modules_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lessons (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_id        INT UNSIGNED NOT NULL,
  title            VARCHAR(255) NOT NULL,
  lesson_type      ENUM('video','text') NOT NULL,
  content          MEDIUMTEXT   NOT NULL,                     -- YouTube/Vimeo ID ya da Markdown
  duration_minutes INT UNSIGNED NULL,
  sort_order       INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_lessons_module (module_id, sort_order),
  CONSTRAINT fk_lessons_module FOREIGN KEY (module_id) REFERENCES modules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Sınav motoru ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id                INT UNSIGNED NOT NULL,
  module_id                INT UNSIGNED NULL,                 -- NULL = kurs final sınavı
  title                    VARCHAR(255) NOT NULL,
  passing_score_percentage INT          NOT NULL DEFAULT 70,
  PRIMARY KEY (id),
  KEY idx_quizzes_course (course_id),
  KEY idx_quizzes_module (module_id),
  CONSTRAINT fk_quizzes_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE,
  CONSTRAINT fk_quizzes_module FOREIGN KEY (module_id) REFERENCES modules (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS questions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  quiz_id       INT UNSIGNED NOT NULL,
  question_text TEXT         NOT NULL,
  PRIMARY KEY (id),
  KEY idx_questions_quiz (quiz_id),
  CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS options (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id INT UNSIGNED NOT NULL,
  option_text TEXT         NOT NULL,
  is_correct  TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_options_question (question_id),
  CONSTRAINT fk_options_question FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Kayıt, ilerleme, sertifika ────────────────────────────────────────────────
-- source: nasıl erişim kazanıldı (admin ataması, satın alma, Plus aboneliği)
CREATE TABLE IF NOT EXISTS enrollments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  course_id   INT UNSIGNED NOT NULL,
  status      ENUM('active','completed') NOT NULL DEFAULT 'active',
  source      ENUM('admin','purchase','plus') NOT NULL DEFAULT 'admin',
  enrolled_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_enrollment (user_id, course_id),
  KEY idx_enrollments_course (course_id),
  CONSTRAINT fk_enroll_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_enroll_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lesson_progress (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  lesson_id    INT UNSIGNED NOT NULL,
  completed_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_lesson (user_id, lesson_id),
  CONSTRAINT fk_progress_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_progress_lesson FOREIGN KEY (lesson_id) REFERENCES lessons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  quiz_id      INT UNSIGNED NOT NULL,
  score        INT          NOT NULL,                         -- yüzde 0-100
  is_passed    TINYINT(1)   NOT NULL DEFAULT 0,
  attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempts_user_quiz (user_id, quiz_id),
  CONSTRAINT fk_attempts_user FOREIGN KEY (user_id) REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_attempts_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS certificates (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  course_id        INT UNSIGNED NOT NULL,
  certificate_code VARCHAR(40)  NOT NULL,
  score            INT          NULL,                         -- final sınav puanı
  issued_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_certificate_code (certificate_code),
  UNIQUE KEY uq_user_course_cert (user_id, course_id),
  CONSTRAINT fk_certs_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_certs_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Siparişler (satın alma) ───────────────────────────────────────────────────
-- Kart verisi ASLA burada tutulmaz. status: pending → paid (onay/ödeme) | rejected.
CREATE TABLE IF NOT EXISTS orders (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  plan         ENUM('single','plus') NOT NULL,
  course_id    INT UNSIGNED NULL,                             -- plan=single ise dolu
  amount       DECIMAL(10,2) NOT NULL,
  currency     CHAR(3)      NOT NULL DEFAULT 'TRY',
  status       ENUM('pending','paid','rejected') NOT NULL DEFAULT 'pending',
  provider     VARCHAR(30)  NOT NULL DEFAULT 'manual',
  provider_ref VARCHAR(120) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at      DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_orders_user (user_id),
  KEY idx_orders_status (status),
  CONSTRAINT fk_orders_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_orders_course FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

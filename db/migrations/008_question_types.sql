-- Soru tipleri: tek cevaplı (mevcut), çok cevaplı, sürükle-bırak (kategorilere ayırma) ve senaryo.
-- Senaryo da bir questions satırıdır (puanlanmaz); alt soruları parent_id ile ona bağlanır.
ALTER TABLE questions
  ADD COLUMN type ENUM('single','multiple','categorize','scenario') NOT NULL DEFAULT 'single' AFTER quiz_id,
  ADD COLUMN parent_id INT UNSIGNED NULL AFTER type,
  ADD COLUMN scenario_prompt TEXT NULL AFTER explanation,
  ADD COLUMN position INT NOT NULL DEFAULT 0,
  ADD KEY idx_questions_parent (parent_id),
  ADD CONSTRAINT fk_questions_parent FOREIGN KEY (parent_id) REFERENCES questions (id) ON DELETE CASCADE;

UPDATE questions SET position = id;

-- Sürükle-bırak kategorileri; kartlar options satırlarıdır, category_id kartın doğru kategorisidir.
CREATE TABLE IF NOT EXISTS question_categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id INT UNSIGNED NOT NULL,
  name        VARCHAR(500) NOT NULL,
  position    INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_question_categories_question (question_id),
  CONSTRAINT fk_question_categories_question FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE options
  ADD COLUMN category_id INT UNSIGNED NULL AFTER is_correct,
  ADD KEY idx_options_category (category_id),
  ADD CONSTRAINT fk_options_category FOREIGN KEY (category_id) REFERENCES question_categories (id) ON DELETE CASCADE;

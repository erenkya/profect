-- Ders altı soru / yorum akışı ve ders eğitmeni.
--   users.role              → 'instructor' rolü eklenir (eğitmen, kendi derslerinin sorularını yanıtlar)
--   lessons.instructor_id   → dersin eğitmeni; boşsa soru bildirimi tüm yöneticilere gider
--   lesson_comments         → dersin altındaki sorular (parent_id NULL) ve cevaplar (parent_id = soru)
ALTER TABLE users
  MODIFY COLUMN role ENUM('user','admin','instructor') NOT NULL DEFAULT 'user';

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS instructor_id INT UNSIGNED NULL AFTER duration_minutes,
  ADD KEY IF NOT EXISTS idx_lessons_instructor (instructor_id),
  ADD CONSTRAINT fk_lessons_instructor FOREIGN KEY (instructor_id) REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS lesson_comments (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lesson_id  INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  parent_id  INT UNSIGNED NULL,                               -- NULL: soru · dolu: o sorunun akışındaki cevap
  body       VARCHAR(2000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_comments_lesson (lesson_id, created_at),
  KEY idx_comments_parent (parent_id),
  KEY idx_comments_user (user_id, created_at),
  CONSTRAINT fk_comments_lesson FOREIGN KEY (lesson_id) REFERENCES lessons (id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES lesson_comments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

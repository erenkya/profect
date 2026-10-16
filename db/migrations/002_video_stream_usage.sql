-- Ders videosu akış kotası: kullanıcı × ders × gün başına akıtılan bayt (hesap paylaşımı / otomatik indirme caydırıcısı).
CREATE TABLE IF NOT EXISTS video_stream_usage (
  user_id   INT UNSIGNED    NOT NULL,
  lesson_id INT UNSIGNED    NOT NULL,
  day       DATE            NOT NULL,
  bytes     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, lesson_id, day),
  KEY idx_usage_lesson (lesson_id),
  CONSTRAINT fk_usage_user   FOREIGN KEY (user_id)   REFERENCES users (id)   ON DELETE CASCADE,
  CONSTRAINT fk_usage_lesson FOREIGN KEY (lesson_id) REFERENCES lessons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

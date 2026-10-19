-- Ücretsiz önizleme (girişsiz) video akış kotası: IP özeti × ders × gün. Ham IP saklanmaz (SHA-256).
CREATE TABLE IF NOT EXISTS video_preview_usage (
  ip_hash   CHAR(64)        NOT NULL,
  lesson_id INT UNSIGNED    NOT NULL,
  day       DATE            NOT NULL,
  bytes     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, lesson_id, day),
  KEY idx_preview_usage_lesson (lesson_id),
  CONSTRAINT fk_preview_usage_lesson FOREIGN KEY (lesson_id) REFERENCES lessons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

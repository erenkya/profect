-- Program tanıtım videosu: R2 nesne anahtarı (programlar/<id>/<random>-tanitim.mp4). NULL = video yok.
ALTER TABLE programs ADD COLUMN intro_video_key VARCHAR(255) NULL AFTER thumbnail_url;

-- Tanıtım videosu herkese açık (girişsiz dahil); R2 çıkış maliyetini sınırlamak için IP özeti × program × gün akış kotası.
-- Ham IP saklanmaz (SHA-256). Kota kuralı ders videolarıyla aynıdır (video_preview_usage).
CREATE TABLE IF NOT EXISTS program_video_usage (
  ip_hash    CHAR(64)        NOT NULL,
  program_id INT UNSIGNED    NOT NULL,
  day        DATE            NOT NULL,
  bytes      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, program_id, day),
  KEY idx_program_video_usage_program (program_id),
  CONSTRAINT fk_program_video_usage_program FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

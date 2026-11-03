-- Ders dosyaları: bir derse eklenen indirilebilir ekler (sunum, kod, vb.). Nesneler R2'de `dosyalar/<ders>/…` anahtarlarında durur.
CREATE TABLE IF NOT EXISTS lesson_files (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  lesson_id    INT UNSIGNED    NOT NULL,
  title        VARCHAR(120)    NOT NULL,                       -- öğrenciye görünen ad
  file_name    VARCHAR(255)    NOT NULL,                       -- yüklenen özgün dosya adı (indirmede önerilen ad)
  storage_key  VARCHAR(255)    NOT NULL,
  size_bytes   BIGINT UNSIGNED NOT NULL,                       -- R2 HEAD ile doğrulanmış gerçek boyut
  content_type VARCHAR(127)    NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lesson_files_key (storage_key),
  KEY idx_lesson_files_lesson (lesson_id, created_at, id),
  CONSTRAINT fk_lesson_files_lesson FOREIGN KEY (lesson_id) REFERENCES lessons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
